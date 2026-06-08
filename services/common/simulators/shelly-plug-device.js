"use strict";

const { BaseDevice, round } = require("./base-device");

const SHELLY_ACTIONS = Object.freeze(["turn_off", "turn_on", "reduce_load", "restore_load"]);

class ShellyPlugDevice extends BaseDevice {
  constructor(options = {}) {
    super({
      deviceId: options.deviceId || "shelly-plug-001",
      deviceType: "shelly_plug",
      provider: "shelly",
      communityId: options.communityId,
      householdId: options.householdId || "household-shelly-sim",
      areaId: options.areaId,
      controllableLoadKw: options.controllableLoadKw || 1.5,
      supportedActions: SHELLY_ACTIONS,
      initialState: {
        relay_state: "on",
        current_power_kw: 1.2
      }
    });
  }

  tick(timestamp = new Date().toISOString()) {
    if (this.state.relay_state === "off") {
      this.state.current_power_kw = 0;
    } else if (this.state.relay_state === "reduced") {
      this.state.current_power_kw = round(this.controllableLoadKw * 0.35);
    } else {
      this.state.current_power_kw = round(this.controllableLoadKw * 0.8);
    }

    return super.tick(timestamp);
  }

  getData() {
    return {
      active_power_kw: {
        value: round(this.state.current_power_kw),
        unit: "kW"
      }
    };
  }

  applyCommand(action, body = {}, timestamp = new Date().toISOString()) {
    if (action === "turn_off") {
      this.state.relay_state = "off";
    } else if (action === "turn_on" || action === "restore_load") {
      this.state.relay_state = "on";
    } else if (action === "reduce_load") {
      this.state.relay_state = "reduced";
    }

    return super.applyCommand(action, body, timestamp);
  }
}

function createShellyPlugDevice(options = {}) {
  return new ShellyPlugDevice(options);
}

module.exports = {
  SHELLY_ACTIONS,
  ShellyPlugDevice,
  createShellyPlugDevice
};
