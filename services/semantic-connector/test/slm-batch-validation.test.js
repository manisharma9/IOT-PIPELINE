"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateBatchResponse } = require("../src/slm-batch-validation");

const readings = [
  {
    reading_id: "r1",
    reading_name: "active_power_kw",
    reading_value: 1.2,
    reading_unit: "kW",
    device_type: "shelly_plug"
  },
  {
    reading_id: "r2",
    reading_name: "indoor_temperature_c",
    reading_value: 20.4,
    reading_unit: "C",
    device_type: "heat_pump"
  }
];

function validItems() {
  return [
    {
      reading_id: "r1",
      saref_concept: "saref4ener:PowerMeasurement",
      saref_property: "saref:Power",
      saref_unit: "unit:KiloW",
      confidence: 0.94,
      mapping_reason_code: "exact_field_unit_match"
    },
    {
      reading_id: "r2",
      saref_concept: "saref4ener:TemperatureMeasurement",
      saref_property: "saref:Temperature",
      saref_unit: "unit:DEG_C",
      confidence: 0.9,
      mapping_reason_code: "temperature_measurement"
    }
  ];
}

test("strict batch accepts one valid mapping per reading", () => {
  const result = validateBatchResponse(JSON.stringify({ mappings: validItems() }), readings);
  assert.equal(result.valid, true);
  assert.equal(result.accepted.size, 2);
});

test("missing mapping is independently rejected", () => {
  const result = validateBatchResponse(JSON.stringify({ mappings: validItems().slice(0, 1) }), readings);
  assert.deepEqual(result.rejected.get("r2"), ["missing_mapping"]);
});

test("duplicate and unexpected reading IDs are rejected", () => {
  const items = validItems();
  items.push({ ...items[0] });
  items.push({ ...items[0], reading_id: "invented" });
  const result = validateBatchResponse(JSON.stringify({ mappings: items }), readings);
  assert.equal(result.valid, false);
  assert.deepEqual(result.rejected.get("r1"), ["duplicate_reading_id"]);
  assert.equal(result.batchErrors.includes("unexpected_reading_id"), true);
});

test("free text and extra fields are rejected", () => {
  const items = validItems();
  items[0].explanation = "extra uncontrolled text";
  const result = validateBatchResponse(JSON.stringify({ mappings: items }), readings);
  assert.equal(result.rejected.get("r1").includes("mapping_fields_invalid"), true);
});

test("low confidence and impossible unit relationships are rejected", () => {
  const items = validItems();
  items[0].confidence = 0.2;
  items[1].saref_unit = "unit:V";
  const result = validateBatchResponse(JSON.stringify({ mappings: items }), readings, { minConfidence: 0.7 });
  assert.equal(result.rejected.get("r1").includes("confidence_below_threshold"), true);
  assert.equal(result.rejected.get("r2").includes("unit_relationship_invalid"), true);
});

test("command-like or unsupported semantic output cannot pass", () => {
  const items = validItems();
  items[0].mapping_reason_code = "execute_device_command";
  const result = validateBatchResponse(JSON.stringify({ mappings: items }), readings);
  assert.equal(result.rejected.get("r1").includes("unsupported_reason_code"), true);
  assert.equal(result.rejected.get("r1").includes("command_or_control_content_rejected"), true);
});

test("state-code output remains telemetry and passes unit validation", () => {
  const stateReading = [{
    reading_id: "state-1",
    reading_name: "operating_state_code",
    reading_value: 11,
    reading_unit: "state_code",
    device_type: "water_heater"
  }];
  const output = {
    mappings: [{
      reading_id: "state-1",
      saref_concept: "saref4ener:Measurement",
      saref_property: "saref:Property",
      saref_unit: "unit:UNITLESS",
      confidence: 0.91,
      mapping_reason_code: "state_measurement"
    }]
  };
  const result = validateBatchResponse(JSON.stringify(output), stateReading);
  assert.equal(result.valid, true);
});
