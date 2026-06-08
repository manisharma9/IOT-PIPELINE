"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  findDevicesForScope,
  getDeviceById,
  getTotalControllableLoadKw,
  listDevices
} = require("../src/device-registry");

test("device registry includes Shelly Plug, Enode / Easee Core, and heat pump", () => {
  const devices = listDevices();
  const shelly = getDeviceById("shelly-plug-001");
  const easee = getDeviceById("easee-core-001");
  const heatPump = getDeviceById("heat-pump-001");

  assert.equal(devices.length, 3);
  assert.equal(shelly.device_type, "shelly_plug");
  assert.equal(shelly.community_id, "community-dublin-north");
  assert.ok(shelly.supported_actions.includes("reduce_load"));
  assert.equal(easee.provider, "enode");
  assert.equal(easee.charger_type, "easee_core");
  assert.ok(easee.supported_actions.includes("reduce_charging_power"));
  assert.equal(heatPump.device_type, "heat_pump");
  assert.equal(heatPump.provider, "heat_pump_simulator");
  assert.ok(heatPump.supported_actions.includes("reduce_load"));
});

test("device registry filters by community and area", () => {
  const devices = findDevicesForScope({
    communityId: "community-dublin-north",
    areaId: "dublin-north"
  });

  assert.equal(devices.length, 3);
  assert.equal(getTotalControllableLoadKw(devices), 12.1);
});
