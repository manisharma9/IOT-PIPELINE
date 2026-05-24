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
