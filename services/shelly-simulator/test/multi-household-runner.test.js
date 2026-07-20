"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildHouseholds,
  summarizeNumbers
} = require("../../../scripts/run-multi-household-validation");

test("validation runner creates five households with varied independent intervals", () => {
  const households = buildHouseholds({
    householdCount: 5,
    runPrefix: "validation-test",
    minIntervalMs: 300,
    maxIntervalMs: 1400
  });
  const devices = households.flatMap((household) => household.devices);

  assert.equal(households.length, 5);
  assert.equal(devices.length, 15);
  assert.equal(new Set(devices.map((entry) => entry.device.deviceId)).size, 15);
  assert.ok(new Set(devices.map((entry) => entry.interval_ms)).size >= 10);
  assert.ok(devices.every((entry) => entry.interval_ms >= 300 && entry.interval_ms <= 1400));
});

test("runtime number summary reports minimum, average, maximum, and p95", () => {
  assert.deepEqual(summarizeNumbers([10, 20, 30, 40]), {
    minimum: 10,
    average: 25,
    maximum: 40,
    p95: 40
  });
});
