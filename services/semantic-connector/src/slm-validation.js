"use strict";

const { DETERMINISTIC_MAPPINGS } = require("./saref4ener-mapping");

const REQUIRED_SLM_FIELDS = Object.freeze([
  "saref_type",
  "saref_property",
  "saref_unit",
  "saref4ener_concept",
  "ngsi_type",
  "ngsi_property",
  "mapping_confidence",
  "explanation"
]);

const ALLOWED_CONFIDENCE = new Set(["high", "medium", "low"]);
const CONFIDENCE_RANK = Object.freeze({
  low: 1,
  medium: 2,
  high: 3
});
const DEFAULT_MIN_CONFIDENCE = "medium";
const MAX_EXPLANATION_LENGTH = 240;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const SCRIPT_TAG_PATTERN = /<\/?script\b/i;
const COMMAND_VALUE_PATTERN =
  /(execute|command|dispatch|turn[_-]?\s?off|turnoff|turn[_-]?\s?on|turnon|pause[_-]?\s?charging|pausecharging|resume[_-]?\s?charging|resumecharging|setpoint|device[_-]?\s?control|devicecontrol)/i;
const NGSI_PROPERTY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const SAREF_VALUE_PATTERN = /^saref:[A-Za-z][A-Za-z0-9_-]*$/;
const SAREF4ENER_VALUE_PATTERN = /^saref4ener:[A-Za-z][A-Za-z0-9_-]*$/;
const ALLOWED_SLM_FIELDS = new Set(REQUIRED_SLM_FIELDS);
const DEVICE_IDENTITY_FIELDS = Object.freeze([
  "device_id",
  "deviceId",
  "household_id",
  "householdId",
  "command",
  "action",
  "device_command",
  "dispatch_action",
  "setpoint"
]);
const ALLOWED_SAREF4ENER_CONCEPTS = new Set([
  ...Object.values(DETERMINISTIC_MAPPINGS).map((mapping) => mapping.saref4ener_concept),
  "saref4ener:Measurement",
  "saref4ener:TemperatureMeasurement",
  "saref4ener:GridConditionIndicator",
  "saref4ener:LoadMeasurement",
  "saref4ener:DemandMeasurement",
  "saref4ener:HeatPumpPowerMeasurement",
  "saref4ener:HeatPumpTemperatureMeasurement",
  "saref4ener:FlexibilityMeasurement"
]);
const UNIT_ALIASES = new Map([
  ["kw", "kw"],
  ["kilowatt", "kw"],
  ["kilow", "kw"],
  ["unit:kw", "kw"],
  ["unit:kilowatt", "kw"],
  ["unit:kilow", "kw"],
  ["w", "w"],
  ["watt", "w"],
  ["unit:w", "w"],
  ["unit:watt", "w"],
  ["v", "v"],
  ["volt", "v"],
  ["unit:v", "v"],
  ["unit:volt", "v"],
  ["a", "a"],
  ["amp", "a"],
  ["ampere", "a"],
  ["unit:a", "a"],
  ["unit:ampere", "a"],
  ["kwh", "kwh"],
  ["kilowatthour", "kwh"],
  ["kilowatt-hour", "kwh"],
  ["unit:kwh", "kwh"],
  ["unit:kilow-hr", "kwh"],
  ["unit:kilowatthour", "kwh"],
  ["hz", "hz"],
  ["hertz", "hz"],
  ["unit:hz", "hz"],
  ["%", "percent"],
  ["percent", "percent"],
  ["percentage", "percent"],
  ["unit:percent", "percent"],
  ["unit:percentage", "percent"],
  ["c", "c"],
  ["degc", "c"],
  ["degreec", "c"],
  ["celsius", "c"],
  ["unit:deg_c", "c"],
  ["unit:celsius", "c"],
  ["score", "unitless"],
  ["unitless", "unitless"],
  ["unit:unitless", "unitless"],
  ["unit:unit_less", "unitless"]
]);

function parseSlmJson(rawOutput) {
  if (typeof rawOutput !== "string") {
    return {
      valid: false,
      errors: ["SLM output must be a JSON string"],
      value: null
    };
  }

  const trimmedOutput = rawOutput.trim();
  if (!trimmedOutput) {
    return {
      valid: false,
      errors: ["SLM output must not be empty"],
      value: null
    };
  }

  try {
    return {
      valid: true,
      errors: [],
      value: JSON.parse(trimmedOutput)
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`SLM output must be valid JSON: ${error.message}`],
      value: null
    };
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeUnitKey(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "_");

  return UNIT_ALIASES.get(normalizedValue) || null;
}

function areUnitsCompatible(expectedUnit, suggestedUnit) {
  const expected = normalizeUnitKey(expectedUnit);
  const suggested = normalizeUnitKey(suggestedUnit);

  if (!expected || !suggested) {
    return false;
  }

  return expected === suggested;
}

function normalizeMinimumConfidence(value) {
  const normalizedConfidence = String(value || DEFAULT_MIN_CONFIDENCE)
    .trim()
    .toLowerCase();

  return ALLOWED_CONFIDENCE.has(normalizedConfidence)
    ? normalizedConfidence
    : DEFAULT_MIN_CONFIDENCE;
}

function meetsMinimumConfidence(confidence, minimumConfidence) {
  const normalizedConfidence = String(confidence || "").trim().toLowerCase();
  const normalizedMinimum = normalizeMinimumConfidence(minimumConfidence);

  return CONFIDENCE_RANK[normalizedConfidence] >= CONFIDENCE_RANK[normalizedMinimum];
}

function validateSafeExplanation(explanation) {
  const errors = [];
  const normalizedExplanation = normalizeString(explanation);

  if (!normalizedExplanation) {
    errors.push("explanation must be a non-empty string");
  }

  if (normalizedExplanation.length > MAX_EXPLANATION_LENGTH) {
    errors.push(`explanation must be ${MAX_EXPLANATION_LENGTH} characters or fewer`);
  }

  if (
    CONTROL_CHARACTER_PATTERN.test(explanation) ||
    SCRIPT_TAG_PATTERN.test(explanation)
  ) {
    errors.push("explanation contains unsafe text");
  }

  return {
    errors,
    explanation: normalizedExplanation
  };
}

function validateNoUnexpectedFields(output) {
  const errors = [];

  for (const field of Object.keys(output)) {
    if (!ALLOWED_SLM_FIELDS.has(field)) {
      errors.push(`${field} is not an allowed SLM mapping field`);
    }
  }

  for (const field of DEVICE_IDENTITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(output, field)) {
      errors.push(`${field} must not be returned by the SLM mapper`);
    }
  }

  return errors;
}

function validateTelemetryOnlyMapping(mapping) {
  const errors = [];

  if (!SAREF_VALUE_PATTERN.test(mapping.saref_type)) {
    errors.push("saref_type must be a SAREF value");
  }

  if (!SAREF_VALUE_PATTERN.test(mapping.saref_property)) {
    errors.push("saref_property must be a SAREF value");
  }

  if (!SAREF4ENER_VALUE_PATTERN.test(mapping.saref4ener_concept)) {
    errors.push("saref4ener_concept must be a SAREF4ENER value");
  }

  if (!ALLOWED_SAREF4ENER_CONCEPTS.has(mapping.saref4ener_concept)) {
    errors.push("saref4ener_concept is not supported by the local semantic guardrails");
  }

  if (mapping.ngsi_type !== "Property") {
    errors.push("ngsi_type must be Property");
  }

  if (!NGSI_PROPERTY_PATTERN.test(mapping.ngsi_property)) {
    errors.push("ngsi_property must be a safe normalized telemetry attribute name");
  }

  for (const field of [
    "saref_type",
    "saref_property",
    "saref4ener_concept",
    "ngsi_property",
    "explanation"
  ]) {
    if (COMMAND_VALUE_PATTERN.test(mapping[field])) {
      errors.push(`${field} must describe telemetry semantics, not executable commands`);
    }
  }

  if (!normalizeUnitKey(mapping.saref_unit)) {
    errors.push("saref_unit is not supported by the local semantic guardrails");
  }

  return errors;
}

function validateAgainstEventUnit(mapping, event) {
  if (!event || event.reading_unit === null || event.reading_unit === undefined) {
    return [];
  }

  return areUnitsCompatible(event.reading_unit, mapping.saref_unit)
    ? []
    : ["saref_unit is incompatible with the normalized telemetry unit"];
}

function validateAgainstDeterministicMapping(mapping, deterministicMapping) {
  if (!deterministicMapping || deterministicMapping.mapping_source === "unmapped") {
    return {
      valid: true,
      errors: [],
      status: "not_available"
    };
  }

  const errors = [];

  if (!areUnitsCompatible(deterministicMapping.saref_unit, mapping.saref_unit)) {
    errors.push("SLM unit failed deterministic SAREF4ENER validation");
  }

  if (mapping.saref_property !== deterministicMapping.saref_property) {
    errors.push("SLM property failed deterministic SAREF4ENER validation");
  }

  if (mapping.saref4ener_concept !== deterministicMapping.saref4ener_concept) {
    errors.push("SLM concept failed deterministic SAREF4ENER validation");
  }

  return {
    valid: errors.length === 0,
    errors,
    status: errors.length === 0 ? "passed" : "failed"
  };
}

function validateSlmMappingObject(output, options = {}) {
  const errors = [];

  if (!isPlainObject(output)) {
    return {
      valid: false,
      errors: ["SLM mapping must be a JSON object"],
      mapping: null
    };
  }

  errors.push(...validateNoUnexpectedFields(output));

  const mapping = {};

  for (const field of REQUIRED_SLM_FIELDS) {
    if (typeof output[field] !== "string") {
      errors.push(`${field} must be a string`);
      continue;
    }

    mapping[field] = normalizeString(output[field]);
    if (!mapping[field]) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (
    typeof mapping.mapping_confidence === "string" &&
    !ALLOWED_CONFIDENCE.has(mapping.mapping_confidence.toLowerCase())
  ) {
    errors.push("mapping_confidence must be high, medium, or low");
  }

  if (
    typeof mapping.mapping_confidence === "string" &&
    ALLOWED_CONFIDENCE.has(mapping.mapping_confidence.toLowerCase()) &&
    !meetsMinimumConfidence(mapping.mapping_confidence, options.minConfidence)
  ) {
    errors.push(
      `mapping_confidence ${mapping.mapping_confidence.toLowerCase()} is below minimum ${normalizeMinimumConfidence(options.minConfidence)}`
    );
  }

  if (typeof output.explanation === "string") {
    const explanationValidation = validateSafeExplanation(output.explanation);
    errors.push(...explanationValidation.errors);
    mapping.explanation = explanationValidation.explanation;
  }

  if (errors.length === 0) {
    errors.push(...validateTelemetryOnlyMapping(mapping));
    errors.push(...validateAgainstEventUnit(mapping, options.event));

    const deterministicValidation = validateAgainstDeterministicMapping(
      mapping,
      options.deterministicMapping
    );
    errors.push(...deterministicValidation.errors);
    mapping.deterministic_validation = deterministicValidation.status;
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      mapping: null
    };
  }

  return {
    valid: true,
    errors: [],
    mapping: {
      saref_type: mapping.saref_type,
      saref_property: mapping.saref_property,
      saref_unit: mapping.saref_unit,
      saref4ener_concept: mapping.saref4ener_concept,
      ngsi_type: mapping.ngsi_type,
      ngsi_property: mapping.ngsi_property,
      mapping_source: "slm_primary",
      mapping_confidence: mapping.mapping_confidence.toLowerCase(),
      slm_confidence: mapping.mapping_confidence.toLowerCase(),
      deterministic_validation: mapping.deterministic_validation,
      validation_source:
        mapping.deterministic_validation === "passed"
          ? "deterministic_validation"
          : "slm_guardrails",
      explanation: mapping.explanation
    }
  };
}

function parseAndValidateSlmMapping(rawOutput, options = {}) {
  const parsed = parseSlmJson(rawOutput);

  if (!parsed.valid) {
    return {
      valid: false,
      errors: parsed.errors,
      mapping: null
    };
  }

  return validateSlmMappingObject(parsed.value, options);
}

module.exports = {
  ALLOWED_CONFIDENCE,
  ALLOWED_SAREF4ENER_CONCEPTS,
  DEFAULT_MIN_CONFIDENCE,
  MAX_EXPLANATION_LENGTH,
  REQUIRED_SLM_FIELDS,
  areUnitsCompatible,
  meetsMinimumConfidence,
  normalizeMinimumConfidence,
  normalizeUnitKey,
  parseAndValidateSlmMapping,
  parseSlmJson,
  validateAgainstDeterministicMapping,
  validateSlmMappingObject
};
