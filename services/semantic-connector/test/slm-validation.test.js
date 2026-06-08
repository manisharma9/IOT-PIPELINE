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

test("valid SLM mapping JSON is accepted and marked slm_primary", () => {
  const result = parseAndValidateSlmMapping(JSON.stringify(validSlmOutput()));

  assert.equal(result.valid, true);
  assert.equal(result.mapping.mapping_source, "slm_primary");
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

test("low confidence SLM mapping is rejected by default guardrails", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      mapping_confidence: "low"
    })
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /below minimum medium/);
});

test("hallucinated device identity field is rejected", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      device_id: "different-device"
    })
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /device_id/);
});

test("unsupported or impossible units are rejected", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      saref_unit: "unit:BANANA"
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("saref_unit is not supported by the local semantic guardrails"));
});

test("unsupported SAREF4ENER concepts are rejected", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      saref4ener_concept: "saref4ener:ExecuteDeviceCommand"
    })
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /not supported/);
});

test("SLM command or device-control output is rejected", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      ngsi_property: "turnOffDevice",
      explanation: "Create a command to turn off the device."
    })
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /telemetry semantics, not executable commands/);
});

test("deterministic validation rejects known reading concept mismatch", () => {
  const result = validateSlmMappingObject(
    validSlmOutput({
      saref_property: "saref:Voltage",
      saref_unit: "unit:V",
      saref4ener_concept: "saref4ener:VoltageMeasurement",
      ngsi_property: "voltage",
      mapping_confidence: "high"
    }),
    {
      event: {
        reading_name: "active_power_kw",
        reading_unit: "kW"
      },
      deterministicMapping: {
        saref_property: "saref:Power",
        saref_unit: "unit:KiloW",
        saref4ener_concept: "saref4ener:PowerMeasurement",
        mapping_source: "deterministic"
      }
    }
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join("; "), /deterministic SAREF4ENER validation/);
});
