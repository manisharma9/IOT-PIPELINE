"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { normalizeTelemetry } = require("../src/normalizer");

function loadSamplePayload() {
  const samplePath = path.resolve(__dirname, "../../../examples/household_telemetry.json");
  return JSON.parse(fs.readFileSync(samplePath, "utf8"));
}

test("normalizer creates one normalized row for every reading", () => {
  const payload = loadSamplePayload();
  const result = normalizeTelemetry(payload);

  assert.equal(result.rawRow.household_id, "household-001");
  assert.equal(result.rawRow.protocol, "http");
  assert.equal(result.normalizedRows.length, Object.keys(payload.readings).length);
});

test("normalizer keeps reading values and units", () => {
  const payload = loadSamplePayload();
  const result = normalizeTelemetry(payload);
  const activePower = result.normalizedRows.find(
    (row) => row.reading_name === "active_power_kw"
  );

  assert.equal(activePower.reading_value, 1.42);
  assert.equal(activePower.reading_unit, "kW");
  assert.equal(activePower.normalized_payload.device_type, "smart_meter");
});

test("normalizer supports numeric readings without units", () => {
  const payload = loadSamplePayload();
  payload.readings.frequency_hz = 50;

  const result = normalizeTelemetry(payload);
  const frequency = result.normalizedRows.find((row) => row.reading_name === "frequency_hz");

  assert.equal(frequency.reading_value, 50);
  assert.equal(frequency.reading_unit, null);
});

test("normalizer preserves device metadata as context without creating readings", () => {
  const payload = {
    household_id: "household-001",
    community_id: "community-001",
    device_id: "plug-001",
    device_type: "smart_plug",
    timestamp: "2026-07-27T10:00:00.000Z",
    readings: {
      active_power_kw: { value: 1.2, unit: "kW" }
    },
    metadata: {
      household_profile: "standard_home",
      operating_state: "on",
      simulated: true,
      no_real_execution: true
    },
    protocol: "http",
    source: "scale-smart_plug-simulator"
  };
  const result = normalizeTelemetry(payload);
  assert.equal(result.normalizedRows.length, 1);
  assert.deepEqual(result.normalizedRows[0].device_context, payload.metadata);
  assert.deepEqual(result.normalizedRows[0].normalized_payload.device_context, payload.metadata);
});

test("normalizer preserves producer-assigned idempotency identities", () => {
  const payload = loadSamplePayload();
  payload.message_id = "message-scale-001";
  payload.correlation_id = "correlation-scale-001";
  payload.reading_ids = Object.fromEntries(
    Object.keys(payload.readings).map((field) => [field, `reading-${field}`])
  );

  const result = normalizeTelemetry(payload);

  assert.equal(result.rawRow.message_id, "message-scale-001");
  assert.equal(result.normalizedRows[0].correlation_id, "correlation-scale-001");
  assert.equal(
    result.normalizedRows[0].reading_id,
    payload.reading_ids[result.normalizedRows[0].reading_name]
  );
});
