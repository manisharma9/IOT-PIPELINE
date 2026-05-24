"use strict";

const DEVICES = Object.freeze([
  {
    device_id: "shelly-plug-001",
    device_type: "shelly_plug",
    provider: "shelly",
    community_id: "community-dublin-north",
    area_id: "dublin-north",
    controllable_load_kw: 1.5,
    supported_actions: Object.freeze(["turn_off", "turn_on", "reduce_load", "restore_load"])
  },
  {
    device_id: "easee-core-001",
    device_type: "ev_charger",
    provider: "enode",
    charger_type: "easee_core",
    community_id: "community-dublin-north",
    area_id: "dublin-north",
    controllable_load_kw: 7.4,
    supported_actions: Object.freeze([
      "pause_charging",
      "resume_charging",
      "reduce_charging_power",
      "restore_charging_power"
    ])
  }
]);

function listDevices() {
  return DEVICES.map((device) => ({
    ...device,
    supported_actions: [...device.supported_actions]
  }));
}

function getDeviceById(deviceId) {
  return listDevices().find((device) => device.device_id === deviceId) || null;
}

function findDevicesForScope({ communityId, areaId } = {}) {
  return listDevices().filter((device) => {
    const communityMatches = !communityId || device.community_id === communityId;
    const areaMatches = !areaId || device.area_id === areaId;
    return communityMatches && areaMatches;
  });
}

function getTotalControllableLoadKw(devices = listDevices()) {
  return devices.reduce((sum, device) => sum + Number(device.controllable_load_kw || 0), 0);
}

module.exports = {
  DEVICES,
  findDevicesForScope,
  getDeviceById,
  getTotalControllableLoadKw,
  listDevices
};
