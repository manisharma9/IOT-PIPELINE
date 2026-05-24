"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateTelemetry } = require("../../common/telemetry-validator");

function loadSamplePayload() {
  const samplePath = path.resolve(__dirname, "../../../examples/household_telemetry.json");
  return JSON.parse(fs.readFileSync(samplePath, "utf8"));
}

test("valid household telemetry passes validation", () => {
  const payload = loadSamplePayload();
  const result = validateTelemetry(payload);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("telemetry missing household_id fails validation", () => {
  const payload = loadSamplePayload();
  delete payload.household_id;

  const result = validateTelemetry(payload);

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.path === "household_id"), true);
});

test("telemetry with a non-numeric reading fails validation", () => {
  const payload = loadSamplePayload();
  payload.readings.active_power_kw.value = "high";

  const result = validateTelemetry(payload);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.path === "readings.active_power_kw.value"),
    true
  );
});
