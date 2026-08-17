"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { getSaref4enerMapping } = require("../src/saref4ener-mapping");

test("known reading uses deterministic SAREF4ENER mapping", () => {
  const mapping = getSaref4enerMapping("active_power_kw");

  assert.equal(mapping.mapping_source, "deterministic");
  assert.equal(mapping.mapping_confidence, "high");
  assert.equal(mapping.saref_property, "saref:Power");
  assert.equal(mapping.saref4ener_concept, "saref4ener:PowerMeasurement");
  assert.equal(mapping.ngsi_property, "activePower");
});

test("unknown reading falls back without crashing", () => {
  const mapping = getSaref4enerMapping("heat_pump_mystery_metric");

  assert.equal(mapping.mapping_source, "unmapped");
  assert.equal(mapping.mapping_confidence, "low");
  assert.equal(mapping.saref_property, "unmapped");
  assert.equal(mapping.ngsi_property, "heat_pump_mystery_metric");
  assert.match(mapping.explanation, /No accepted SLM or deterministic SAREF4ENER mapping exists/);
});

test("validator vocabulary covers the 1,000-asset semantic coverage fields", () => {
  for (const field of [
    "heat_pump_power_kw",
    "battery_power_kw",
    "battery_soc_percent",
    "pv_generation_kw",
    "indoor_temperature_c",
    "target_temperature_c",
    "flow_temperature_c",
    "water_temperature_c",
    "energy_delivered_kwh",
    "energy_export_kwh",
    "energy_throughput_kwh",
    "charging_state_code",
    "operating_state_code",
    "operating_mode_code",
    "device_availability_code"
  ]) {
    assert.notEqual(
      getSaref4enerMapping(field).mapping_source,
      "unmapped",
      `${field} must be available to deterministic validation`
    );
  }
});
