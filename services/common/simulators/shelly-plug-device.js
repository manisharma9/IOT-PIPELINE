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
      random: options.random,
      initialState: {
        relay_state: "on",
        current_power_kw: Number(options.initialPowerKw ?? 1.2),
        voltage_v: Number(options.initialVoltageV ?? 232),
        current_a: Number(options.initialCurrentA ?? 5.17),
        energy_import_kwh: Number(options.initialEnergyKwh ?? 124.5)
      }
    });
  }

  tick(timestamp = new Date().toISOString()) {
    const elapsedHours = this.elapsedHours(timestamp);
    if (this.state.relay_state === "off") {
      this.state.current_power_kw = 0;
    } else if (this.state.relay_state === "reduced") {
      this.state.current_power_kw = round(
        this.controllableLoadKw * this.randomBetween(0.3, 0.42)
      );
    } else {
      this.state.current_power_kw = round(
        this.controllableLoadKw * this.randomBetween(0.68, 0.92)
      );
    }

    this.state.voltage_v = round(this.randomBetween(228, 238), 1);
    this.state.current_a = this.state.voltage_v > 0
      ? round((this.state.current_power_kw * 1000) / this.state.voltage_v, 2)
      : 0;
    this.state.energy_import_kwh = round(
      this.state.energy_import_kwh + this.state.current_power_kw * elapsedHours,
      4
    );

    return super.tick(timestamp);
  }

  getData() {
    return {
      active_power_kw: {
        value: round(this.state.current_power_kw),
        unit: "kW"
      },
      voltage_v: {
        value: round(this.state.voltage_v, 1),
        unit: "V"
      },
      current_a: {
        value: round(this.state.current_a, 2),
        unit: "A"
      },
      energy_import_kwh: {
        value: round(this.state.energy_import_kwh, 4),
        unit: "kWh"
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
