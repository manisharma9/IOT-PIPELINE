"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createEnodeEaseeDevice,
  createHeatPumpDevice,
  createShellyPlugDevice
} = require("../../common/simulators");

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createHouseholdDevices(householdNumber) {
  const suffix = String(householdNumber).padStart(3, "0");
  const householdId = `household-${suffix}`;
  const common = {
    householdId,
    communityId: "community-dublin-north",
    areaId: "dublin-north"
  };

  return [
    createShellyPlugDevice({
      ...common,
      deviceId: `shelly-plug-${suffix}`,
      controllableLoadKw: 1.1 + householdNumber * 0.15,
      initialEnergyKwh: 100 + householdNumber * 7,
      random: seededRandom(100 + householdNumber)
    }),
    createEnodeEaseeDevice({
      ...common,
      deviceId: `easee-core-${suffix}`,
      controllableLoadKw: 6.6 + householdNumber * 0.15,
      initialEnergyKwh: 12 + householdNumber * 2.5,
      random: seededRandom(200 + householdNumber)
    }),
    createHeatPumpDevice({
      ...common,
      deviceId: `heat-pump-${suffix}`,
      controllableLoadKw: 2.6 + householdNumber * 0.18,
      initialIndoorTemperatureC: 19.4 + householdNumber * 0.25,
      targetTemperatureC: 20.5 + householdNumber * 0.2,
      random: seededRandom(300 + householdNumber)
    })
  ];
}

test("five households create fifteen unique independent devices", () => {
  const devices = Array.from({ length: 5 }, (_, index) => createHouseholdDevices(index + 1)).flat();
  const telemetry = devices.map((device, index) =>
    device.getTelemetry(new Date(Date.UTC(2026, 6, 20, 9, 0, index)).toISOString())
  );

  assert.equal(devices.length, 15);
  assert.equal(new Set(telemetry.map((event) => event.deviceId)).size, 15);
  assert.equal(new Set(telemetry.map((event) => event.householdId)).size, 5);
  assert.equal(new Set(telemetry.map((event) => JSON.stringify(event.data))).size, 15);
  assert.ok(telemetry.every((event) => event.timestamp && event.deviceId && event.householdId));
});

test("Shelly telemetry includes realistic electrical and cumulative energy readings", () => {
  const device = createShellyPlugDevice({ random: seededRandom(11), initialEnergyKwh: 50 });
  const first = device.getTelemetry("2026-07-20T09:00:00.000Z");
  const second = device.getTelemetry("2026-07-20T09:01:00.000Z");

  assert.deepEqual(Object.keys(second.data), [
    "active_power_kw",
    "voltage_v",
    "current_a",
    "energy_import_kwh"
  ]);
  assert.ok(second.data.voltage_v.value >= 228 && second.data.voltage_v.value <= 238);
  assert.ok(second.data.current_a.value >= 0);
  assert.ok(second.data.energy_import_kwh.value > first.data.energy_import_kwh.value);
});

test("Enode telemetry includes charging state, power, and delivered energy", () => {
  const device = createEnodeEaseeDevice({ random: seededRandom(22), initialEnergyKwh: 10 });
  const first = device.getTelemetry("2026-07-20T09:00:00.000Z");
  const second = device.getTelemetry("2026-07-20T09:01:00.000Z");

  assert.ok(second.data.ev_charging_power_kw.value > 0);
  assert.equal(second.data.charging_state_code.value, 1);
  assert.equal(second.data.charging_state_code.unit, "state_code");
  assert.ok(second.data.energy_delivered_kwh.value > first.data.energy_delivered_kwh.value);
});

test("heat pump telemetry includes room, target, mode, and power readings", () => {
  const device = createHeatPumpDevice({
    random: seededRandom(33),
    initialIndoorTemperatureC: 19.5,
    targetTemperatureC: 21
  });
  const telemetry = device.getTelemetry("2026-07-20T09:00:00.000Z");

  assert.ok(telemetry.data.heat_pump_power_kw.value > 0);
  assert.ok(telemetry.data.indoor_temperature_c.value >= 15);
  assert.equal(telemetry.data.target_temperature_c.value, 21);
  assert.equal(telemetry.data.operating_mode_code.value, 1);
  assert.equal(telemetry.data.operating_mode_code.unit, "state_code");
});

