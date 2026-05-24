"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  determineResourceType,
  translateGridSignal,
  translateSemanticEvent,
  validateGridSignal,
  validateSemanticEvent
} = require("../src/translator");

function semanticEvent(overrides = {}) {
  return {
    event_time: "2026-05-24T17:00:00.000Z",
    processed_at: "2026-05-24T17:00:01.000Z",
    household_id: "household-001",
    community_id: "community-dublin-north",
    device_id: "meter-001",
    device_type: "smart_meter",
    reading_name: "active_power_kw",
    reading_value: 1.42,
    reading_unit: "kW",
    saref_type: "saref:Measurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    saref4ener_concept: "saref4ener:PowerMeasurement",
    ngsi_type: "Property",
    ngsi_property: "activePower",
    semantic_payload: {
      measurement: {
        name: "active_power_kw",
        value: 1.42
      }
    },
    mapping_source: "deterministic",
    mapping_confidence: "high",
    explanation: "Active power in kW is mapped as an instantaneous power measurement.",
    correlation_id: "raw.telemetry:0:12",
    ...overrides
  };
}

function gridSignal(overrides = {}) {
  return {
    signal_id: "signal-001",
    dso_id: "dso-dublin",
    community_id: "community-dublin-north",
    signal_type: "curtailment_request",
    severity: "medium",
    requested_action: "reduce_load",
    start_time: "2026-05-24T18:00:00Z",
    end_time: "2026-05-24T19:00:00Z",
    reason: "Local transformer load is approaching threshold",
    ...overrides
  };
}

test("semantic enriched event validation accepts valid event", () => {
  const validation = validateSemanticEvent(semanticEvent());

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test("active_power_kw translates to MirrorMeterReading style payload", () => {
  const translated = translateSemanticEvent(semanticEvent(), {
    processedAt: "2026-05-24T17:00:02.000Z"
  });

  assert.equal(translated.resource_type, "MirrorMeterReading");
  assert.equal(translated.translation_status, "translated");
  assert.equal(translated.translation_confidence, "high");
  assert.equal(translated.ieee20305_payload.measurement.value, 1.42);
  assert.equal(translated.ieee20305_payload.measurement.unit, "kW");
  assert.match(translated.ieee20305_payload.href, /\/mup\//);
  assert.match(translated.ieee20305_payload.note, /not a certified IEEE 2030\.5/);
});

test("battery or PV readings translate to DERStatus style payload", () => {
  const translated = translateSemanticEvent(
    semanticEvent({
      device_id: "battery-001",
      device_type: "battery_storage",
      reading_name: "battery_soc_percent",
      reading_value: 78,
      reading_unit: "%",
      saref_property: "saref:StateOfCharge",
      saref_unit: "unit:PERCENT",
      saref4ener_concept: "saref4ener:BatteryStateOfChargeMeasurement",
      ngsi_property: "batteryStateOfCharge"
    })
  );

  assert.equal(determineResourceType(translated.raw_semantic_payload), "DERStatus");
  assert.equal(translated.resource_type, "DERStatus");
  assert.match(translated.ieee20305_payload.href, /\/der\/battery-001\/status\//);
});

test("invalid semantic event falls back without throwing", () => {
  const translated = translateSemanticEvent({
    reading_name: "active_power_kw",
    reading_value: "high"
  });

  assert.equal(translated.translation_status, "invalid_semantic_event");
  assert.equal(translated.translation_confidence, "low");
  assert.equal(translated.resource_type, "MirrorMeterReading");
  assert.match(translated.explanation, /could not be translated/);
});

test("valid DSO grid signal validation passes", () => {
  const validation = validateGridSignal(gridSignal());

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test("invalid DSO grid signal returns validation errors", () => {
  const validation = validateGridSignal(
    gridSignal({
      signal_type: "unsupported",
      requested_action: "turn_everything_off",
      end_time: "2026-05-24T17:00:00Z"
    })
  );

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.includes("signal_type")), true);
  assert.equal(validation.errors.some((error) => error.includes("requested_action")), true);
  assert.equal(validation.errors.some((error) => error.includes("end_time")), true);
});

test("grid signal translates to GridSignal payload", () => {
  const translation = translateGridSignal(gridSignal(), {
    processedAt: "2026-05-24T17:55:00.000Z"
  });

  assert.equal(translation.status, "translated");
  assert.equal(translation.event.resource_type, "GridSignal");
  assert.equal(translation.event.output_topic, "grid.signals");
  assert.equal(translation.event.translation_confidence, "high");
  assert.equal(translation.event.ieee20305_payload.signal.requested_action, "reduce_load");
  assert.match(translation.event.ieee20305_payload.href, /\/grid-signals\/signal-001/);
});
