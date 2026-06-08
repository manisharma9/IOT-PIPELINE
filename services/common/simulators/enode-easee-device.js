"use strict";

const { BaseDevice, round } = require("./base-device");

const ENODE_ACTIONS = Object.freeze([
  "pause_charging",
  "resume_charging",
  "reduce_charging_power",
  "restore_charging_power"
]);

class EnodeEaseeDevice extends BaseDevice {
  constructor(options = {}) {
    super({
      deviceId: options.deviceId || "easee-core-001",
      deviceType: "ev_charger",
      provider: "enode",
      communityId: options.communityId,
      householdId: options.householdId || "household-easee-sim",
      areaId: options.areaId,
      controllableLoadKw: options.controllableLoadKw || 7.4,
      supportedActions: ENODE_ACTIONS,
      initialState: {
        charger_type: "easee_core",
        charging_state: "charging",
        charging_power_kw: 6.8
      }
    });
  }

  tick(timestamp = new Date().toISOString()) {
    if (this.state.charging_state === "paused") {
      this.state.charging_power_kw = 0;
    } else if (this.state.charging_state === "reduced") {
      this.state.charging_power_kw = round(this.controllableLoadKw * 0.45);
    } else {
      this.state.charging_power_kw = round(this.controllableLoadKw * 0.92);
    }

    return super.tick(timestamp);
  }

  getData() {
    return {
      ev_charging_power_kw: {
        value: round(this.state.charging_power_kw),
        unit: "kW"
      }
    };
  }

  applyCommand(action, body = {}, timestamp = new Date().toISOString()) {
    if (action === "pause_charging") {
      this.state.charging_state = "paused";
    } else if (action === "resume_charging" || action === "restore_charging_power") {
      this.state.charging_state = "charging";
    } else if (action === "reduce_charging_power") {
      this.state.charging_state = "reduced";
    }

    return {
      charger_id: body.charger_id || body.device_id || this.deviceId,
      chargerId: body.chargerId || body.charger_id || body.device_id || this.deviceId,
      charger_type: "easee_core",
      ...super.applyCommand(action, body, timestamp)
    };
  }
}

function createEnodeEaseeDevice(options = {}) {
  return new EnodeEaseeDevice(options);
}

module.exports = {
  ENODE_ACTIONS,
  EnodeEaseeDevice,
  createEnodeEaseeDevice
};
