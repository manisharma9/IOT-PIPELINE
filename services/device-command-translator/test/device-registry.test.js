"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  findDevicesForScope,
  getDeviceById,
  getTotalControllableLoadKw,
  listDevices
} = require("../src/device-registry");

test("device registry includes Shelly Plug and Enode / Easee Core", () => {
  const devices = listDevices();
  const shelly = getDeviceById("shelly-plug-001");
  const easee = getDeviceById("easee-core-001");

  assert.equal(devices.length, 2);
  assert.equal(shelly.device_type, "shelly_plug");
  assert.equal(shelly.community_id, "community-dublin-north");
  assert.ok(shelly.supported_actions.includes("reduce_load"));
  assert.equal(easee.provider, "enode");
  assert.equal(easee.charger_type, "easee_core");
  assert.ok(easee.supported_actions.includes("reduce_charging_power"));
});

test("device registry filters by community and area", () => {
  const devices = findDevicesForScope({
    communityId: "community-dublin-north",
    areaId: "dublin-north"
  });

  assert.equal(devices.length, 2);
  assert.equal(getTotalControllableLoadKw(devices), 8.9);
});
