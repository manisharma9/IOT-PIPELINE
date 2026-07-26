"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFleet, PROFILE_LIMITS } = require("../src/fleet");
const { createRuntime } = require("../src/index");

test("default fleet creates 20 mixed households and every requested category", () => {
  const fleet = buildFleet();
  assert.equal(fleet.summary.household_count, 20);
  assert.ok(fleet.summary.average_devices_per_household >= 10);
  assert.ok(fleet.summary.average_devices_per_household <= 14);
  assert.deepEqual(Object.keys(fleet.summary.profiles).sort(), [
    "apartment",
    "prosumer_home",
    "standard_home"
  ]);
  for (const category of [
    "smart_meter",
    "smart_plug",
    "refrigerator",
    "washing_machine",
    "clothes_dryer",
    "dishwasher",
    "lighting_circuit",
    "ev_charger",
    "heat_pump",
    "thermostat_hvac",
    "water_heater",
    "solar_inverter",
    "home_battery"
  ]) {
    assert.ok(fleet.summary.categories[category] > 0, `${category} must be represented`);
  }
});

test("profiles stay within their configured bounds and identities are unique", () => {
  const fleet = buildFleet({ householdCount: 60, seed: 42 });
  const householdIds = new Set(fleet.households.map((item) => item.household_id));
  const deviceIds = new Set(fleet.devices.map((item) => item.inventory.device_id));
  assert.equal(householdIds.size, 60);
  assert.equal(deviceIds.size, fleet.devices.length);
  for (const household of fleet.households) {
    const [minimum, maximum] = PROFILE_LIMITS[household.profile];
    assert.ok(household.device_count >= minimum);
    assert.ok(household.device_count <= maximum);
  }
});

test("fleet generation is reproducible for the same seed", () => {
  const first = buildFleet({ householdCount: 8, seed: 123 });
  const second = buildFleet({ householdCount: 8, seed: 123 });
  assert.deepEqual(
    first.devices.map((item) => item.inventory),
    second.devices.map((item) => item.inventory)
  );
});

test("every fleet telemetry envelope is simulated and uses compatibility fields", () => {
  const fleet = buildFleet({ householdCount: 3, seed: 8 });
  for (const entry of fleet.devices) {
    const telemetry = entry.device.getTelemetry("2026-07-24T12:00:00.000Z");
    assert.equal(telemetry.deviceId, entry.inventory.device_id);
    assert.equal(telemetry.householdId, entry.inventory.household_id);
    assert.equal(telemetry.simulated, true);
    assert.equal(telemetry.no_real_execution, true);
    assert.ok(Object.keys(telemetry.data).length >= 2);
    assert.deepEqual(telemetry.readings, telemetry.data);
  }
});

test("bounded runtime emits without per-device timers", async () => {
  const fleet = buildFleet({ householdCount: 1, seed: 4 });
  const sent = [];
  const runtime = createRuntime({
    seed: 4,
    reportingIntervalMs: 10,
    schedulerTickMs: 5,
    maxInFlight: 2,
    gatewayUrl: "http://unused",
    edgeApiKey: "test"
  }, fleet, {
    sendTelemetry: async (telemetry) => sent.push(telemetry)
  });

  runtime.step(Date.now() + 100);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.ok(sent.length > 0);
  assert.ok(sent.length <= 2);
  assert.equal(runtime.summary().scheduler.per_device_threads, 0);
  assert.equal(runtime.stats.telemetry_failed, 0);
  assert.equal(runtime.stats.telemetry_dropped, 0);
});

test("failed gateway delivery retains a bounded pending envelope for retry", async () => {
  const fleet = buildFleet({ householdCount: 1, seed: 14 });
  let attempts = 0;
  const runtime = createRuntime({
    seed: 14,
    reportingIntervalMs: 1000,
    schedulerTickMs: 5,
    maxInFlight: 1,
    gatewayUrl: "http://unused",
    edgeApiKey: "test"
  }, fleet, {
    sendTelemetry: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("rate limited");
        error.retryAfterMs = 1;
        throw error;
      }
    }
  });

  runtime.step(Date.now() + 5000);
  await new Promise((resolve) => setTimeout(resolve, 10));
  runtime.step(Date.now() + 5000);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(runtime.stats.telemetry_generated, 1);
  assert.equal(runtime.stats.telemetry_retried, 1);
  assert.equal(runtime.stats.telemetry_accepted, 1);
  assert.equal(runtime.stats.telemetry_dropped, 0);
});
