"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseAndValidateSlmMapping,
  validateSlmMappingObject
} = require("../src/slm-validation");

function validSlmOutput(overrides = {}) {
  return {
    saref_type: "saref:Measurement",
    saref_property: "saref:Temperature",
    saref_unit: "unit:DEG_C",
    saref4ener_concept: "saref4ener:TemperatureMeasurement",
    ngsi_type: "Property",
    ngsi_property: "temperature",
    mapping_confidence: "medium",
    explanation: "Unknown roomHeat is treated as an indoor temperature reading.",
    ...overrides
  };
}

test("valid SLM mapping JSON is accepted and marked slm_assisted", () => {
  const result = parseAndValidateSlmMapping(JSON.stringify(validSlmOutput()));

  assert.equal(result.valid, true);
  assert.equal(result.mapping.mapping_source, "slm_assisted");
  assert.equal(result.mapping.mapping_confidence, "medium");
  assert.equal(result.mapping.saref_property, "saref:Temperature");
});

test("invalid SLM JSON is rejected", () => {
  const result = parseAndValidateSlmMapping("{not valid json");

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /valid JSON/);
  assert.equal(result.mapping, null);
});

test("malformed SLM mapping output is rejected", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      saref_property: 42,
      mapping_confidence: "certain"
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("saref_property must be a string"));
  assert.ok(result.errors.includes("mapping_confidence must be high, medium, or low"));
});

test("unsafe or long SLM explanation is rejected", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      explanation: `<script>${"x".repeat(241)}</script>`
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("explanation contains unsafe text"));
});
