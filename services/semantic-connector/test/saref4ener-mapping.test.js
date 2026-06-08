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
