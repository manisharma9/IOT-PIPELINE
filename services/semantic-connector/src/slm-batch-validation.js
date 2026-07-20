"use strict";

const responseSchema = require("../../../schemas/slm-semantic-batch-response.schema.json");
const { getSaref4enerMapping } = require("./saref4ener-mapping");

const ITEM_FIELDS = Object.freeze(responseSchema.properties.mappings.items.required);
const TOP_LEVEL_FIELDS = Object.freeze(responseSchema.required);
const ALLOWED_CONCEPTS = new Set(responseSchema.properties.mappings.items.properties.saref_concept.enum);
const ALLOWED_PROPERTIES = new Set(responseSchema.properties.mappings.items.properties.saref_property.enum);
const ALLOWED_UNITS = new Set(responseSchema.properties.mappings.items.properties.saref_unit.enum);
const ALLOWED_REASON_CODES = new Set(
  responseSchema.properties.mappings.items.properties.mapping_reason_code.enum
);

const INPUT_UNIT_TO_SEMANTIC_UNIT = new Map([
  ["kw", "unit:KiloW"],
  ["w", "unit:KiloW"],
  ["kwh", "unit:KiloW-HR"],
  ["wh", "unit:KiloW-HR"],
  ["v", "unit:V"],
  ["a", "unit:A"],
  ["hz", "unit:HZ"],
  ["%", "unit:PERCENT"],
  ["percent", "unit:PERCENT"],
  ["percentage", "unit:PERCENT"],
  ["c", "unit:DEG_C"],
  ["celsius", "unit:DEG_C"],
  ["degc", "unit:DEG_C"],
  ["score", "unit:UNITLESS"],
  ["state_code", "unit:UNITLESS"],
  ["unitless", "unit:UNITLESS"],
  ["", "unit:UNITLESS"]
]);

function parseStrictJson(rawOutput) {
  if (typeof rawOutput !== "string" || rawOutput.trim() === "") {
    return { valid: false, value: null, errors: ["slm_output_not_json_string"] };
  }
  try {
    const value = JSON.parse(rawOutput);
    return { valid: true, value, errors: [] };
  } catch (_error) {
    return { valid: false, value: null, errors: ["slm_output_invalid_json"] };
  }
}

function exactFields(value, allowedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...allowedFields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function normalizeInputUnit(unit) {
  return String(unit || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function expectedUnitForReading(reading) {
  return INPUT_UNIT_TO_SEMANTIC_UNIT.get(normalizeInputUnit(reading.reading_unit)) || null;
}

function validateDeterministicGuardrail(reading, mapping) {
  const errors = [];
  const expectedUnit = expectedUnitForReading(reading);
  if (expectedUnit && mapping.saref_unit !== expectedUnit) {
    errors.push("unit_relationship_invalid");
  }

  const deterministic = getSaref4enerMapping(reading.reading_name);
  if (deterministic.mapping_source !== "unmapped") {
    if (mapping.saref_property !== deterministic.saref_property) {
      errors.push("deterministic_property_validation_failed");
    }
    if (mapping.saref_unit !== deterministic.saref_unit) {
      errors.push("deterministic_unit_validation_failed");
    }
    if (mapping.saref_concept !== deterministic.saref4ener_concept) {
      errors.push("deterministic_concept_validation_failed");
    }
  }

  return {
    valid: errors.length === 0,
    status: errors.length === 0 ? "passed" : "failed",
    expected_mapping_available: deterministic.mapping_source !== "unmapped",
    errors
  };
}

function validateMappingItem(item, reading, minConfidence) {
  const errors = [];
  if (!exactFields(item, ITEM_FIELDS)) errors.push("mapping_fields_invalid");
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { valid: false, errors, deterministicValidation: null };
  }
  if (item.reading_id !== reading.reading_id) errors.push("reading_id_mismatch");
  if (!ALLOWED_CONCEPTS.has(item.saref_concept)) errors.push("unsupported_concept");
  if (!ALLOWED_PROPERTIES.has(item.saref_property)) errors.push("unsupported_property");
  if (!ALLOWED_UNITS.has(item.saref_unit)) errors.push("unsupported_unit");
  if (typeof item.confidence !== "number" || !Number.isFinite(item.confidence)) {
    errors.push("confidence_not_numeric");
  } else if (item.confidence < minConfidence) {
    errors.push("confidence_below_threshold");
  }
  if (!ALLOWED_REASON_CODES.has(item.mapping_reason_code)) errors.push("unsupported_reason_code");

  const serialized = JSON.stringify(item);
  if (/(command|dispatch|execute|turn_off|turn_on|pause_charging|setpoint|credential|password)/i.test(serialized)) {
    errors.push("command_or_control_content_rejected");
  }

  const deterministicValidation = validateDeterministicGuardrail(reading, item);
  errors.push(...deterministicValidation.errors);
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    deterministicValidation
  };
}

function validateBatchResponse(rawOutput, readings, options = {}) {
  const minConfidence = Number(options.minConfidence ?? 0.7);
  const parsed = parseStrictJson(rawOutput);
  if (!parsed.valid) {
    return {
      valid: false,
      batchErrors: parsed.errors,
      accepted: new Map(),
      rejected: new Map(readings.map((reading) => [reading.reading_id, parsed.errors]))
    };
  }

  const batchErrors = [];
  if (!exactFields(parsed.value, TOP_LEVEL_FIELDS)) batchErrors.push("top_level_fields_invalid");
  if (!Array.isArray(parsed.value?.mappings)) batchErrors.push("mappings_not_array");
  if (batchErrors.length) {
    return {
      valid: false,
      batchErrors,
      accepted: new Map(),
      rejected: new Map(readings.map((reading) => [reading.reading_id, batchErrors]))
    };
  }

  const expected = new Map(readings.map((reading) => [reading.reading_id, reading]));
  const seen = new Set();
  const accepted = new Map();
  const rejected = new Map();

  for (const item of parsed.value.mappings) {
    const id = item && typeof item.reading_id === "string" ? item.reading_id : "";
    if (!expected.has(id)) {
      batchErrors.push("unexpected_reading_id");
      continue;
    }
    if (seen.has(id)) {
      rejected.set(id, ["duplicate_reading_id"]);
      continue;
    }
    seen.add(id);
    const itemValidation = validateMappingItem(item, expected.get(id), minConfidence);
    if (itemValidation.valid) {
      accepted.set(id, {
        mapping: item,
        deterministicValidation: itemValidation.deterministicValidation
      });
    } else {
      rejected.set(id, itemValidation.errors);
    }
  }

  for (const reading of readings) {
    if (!seen.has(reading.reading_id)) rejected.set(reading.reading_id, ["missing_mapping"]);
  }

  return {
    valid: batchErrors.length === 0 && rejected.size === 0 && accepted.size === readings.length,
    batchErrors: [...new Set(batchErrors)],
    accepted,
    rejected
  };
}

module.exports = {
  ALLOWED_CONCEPTS,
  ALLOWED_PROPERTIES,
  ALLOWED_REASON_CODES,
  ALLOWED_UNITS,
  ITEM_FIELDS,
  expectedUnitForReading,
  exactFields,
  parseStrictJson,
  validateBatchResponse,
  validateDeterministicGuardrail,
  validateMappingItem
};
