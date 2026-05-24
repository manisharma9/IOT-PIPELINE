"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { getSaref4enerMapping } = require("../src/saref4ener-mapping");
const {
  buildEntityId,
  buildSemanticEvent,
  buildSemanticPayload,
  validateNormalizedTelemetryEvent
} = require("../src/semantic-builder");

function normalizedEvent(overrides = {}) {
  return {
    event_time: "2026-05-24T17:00:00.000Z",
    household_id: "household-001",
    community_id: "community-dublin-north",
    device_id: "meter-001",
    device_type: "smart_meter",
    reading_name: "active_power_kw",
    reading_value: 1.42,
    reading_unit: "kW",
    protocol: "http",
    source: "household-gateway",
    correlation_id: "raw.telemetry:0:1",
    ...overrides
  };
}

test("semantic payload builder creates readable semantic sections", () => {
  const event = normalizedEvent();
  const mapping = getSaref4enerMapping(event.reading_name);
  const payload = buildSemanticPayload(event, mapping);

  assert.equal(payload.entity_id, buildEntityId(event));
  assert.equal(payload.entity_type, "EnergyFlexMeasurement");
  assert.equal(payload.measurement.value, 1.42);
  assert.equal(payload.saref.property, "saref:Power");
  assert.equal(payload.saref4ener.concept, "saref4ener:PowerMeasurement");
  assert.equal(payload.ngsi.property, "activePower");
});

test("semantic event shape contains database and Kafka fields", () => {
  const event = normalizedEvent();
  const mapping = getSaref4enerMapping(event.reading_name);
  const payload = buildSemanticPayload(event, mapping);
  const semanticEvent = buildSemanticEvent(
    event,
    mapping,
    payload,
    "2026-05-24T17:01:00.000Z"
  );

  assert.equal(semanticEvent.event_time, event.event_time);
  assert.equal(semanticEvent.processed_at, "2026-05-24T17:01:00.000Z");
  assert.equal(semanticEvent.household_id, "household-001");
  assert.equal(semanticEvent.reading_name, "active_power_kw");
  assert.equal(semanticEvent.mapping_source, "deterministic");
  assert.equal(semanticEvent.mapping_confidence, "high");
  assert.equal(semanticEvent.enrichment_status, "mapped");
  assert.equal(semanticEvent.semantic_payload.entity_type, "EnergyFlexMeasurement");
});

test("normalized telemetry validation rejects missing required fields", () => {
  const validation = validateNormalizedTelemetryEvent(normalizedEvent({ reading_value: "1.42" }));

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("reading_value must be a finite number"));
});
