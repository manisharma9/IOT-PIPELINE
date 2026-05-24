"use strict";

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
const MAX_EXPLANATION_LENGTH = 240;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const SCRIPT_TAG_PATTERN = /<\/?script\b/i;

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

function validateSlmMappingObject(output) {
  const errors = [];

  if (!isPlainObject(output)) {
    return {
      valid: false,
      errors: ["SLM mapping must be a JSON object"],
      mapping: null
    };
  }

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

  if (typeof output.explanation === "string") {
    const explanationValidation = validateSafeExplanation(output.explanation);
    errors.push(...explanationValidation.errors);
    mapping.explanation = explanationValidation.explanation;
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
      mapping_source: "slm_assisted",
      mapping_confidence: mapping.mapping_confidence.toLowerCase(),
      explanation: mapping.explanation
    }
  };
}

function parseAndValidateSlmMapping(rawOutput) {
  const parsed = parseSlmJson(rawOutput);

  if (!parsed.valid) {
    return {
      valid: false,
      errors: parsed.errors,
      mapping: null
    };
  }

  return validateSlmMappingObject(parsed.value);
}

module.exports = {
  ALLOWED_CONFIDENCE,
  MAX_EXPLANATION_LENGTH,
  REQUIRED_SLM_FIELDS,
  parseAndValidateSlmMapping,
  parseSlmJson,
  validateSlmMappingObject
};
