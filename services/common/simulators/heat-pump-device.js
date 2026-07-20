"use strict";

const { BaseDevice, round } = require("./base-device");

const HEAT_PUMP_ACTIONS = Object.freeze([
  "reduce_load",
  "restore_load",
  "set_temperature",
  "boost_heat"
]);

class HeatPumpDevice extends BaseDevice {
  constructor(options = {}) {
    super({
      deviceId: options.deviceId || "heat-pump-001",
      deviceType: "heat_pump",
      provider: "heat_pump_simulator",
      communityId: options.communityId,
      householdId: options.householdId || "household-heat-pump-sim",
      areaId: options.areaId,
      controllableLoadKw: options.controllableLoadKw || 3.2,
      supportedActions: HEAT_PUMP_ACTIONS,
      random: options.random,
      initialState: {
        operating_state: "heating",
        heating_power_kw: Number(options.initialPowerKw ?? 2.4),
        indoor_temperature_c: Number(options.initialIndoorTemperatureC ?? 20.8),
        target_temperature_c: Number(options.targetTemperatureC ?? 21),
        flow_temperature_c: Number(options.initialFlowTemperatureC ?? 38),
        operating_mode_code: 1
      }
    });
  }

  tick(timestamp = new Date().toISOString()) {
    if (this.state.operating_state === "reduced") {
      this.state.heating_power_kw = round(
        this.controllableLoadKw * this.randomBetween(0.3, 0.42)
      );
      this.state.flow_temperature_c = round(this.randomBetween(33, 35), 1);
      this.state.operating_mode_code = 2;
    } else if (this.state.operating_state === "boost") {
      this.state.heating_power_kw = round(
        this.controllableLoadKw * this.randomBetween(0.94, 1)
      );
      this.state.flow_temperature_c = round(this.randomBetween(41, 43), 1);
      this.state.operating_mode_code = 3;
    } else {
      this.state.heating_power_kw = round(
        this.controllableLoadKw * this.randomBetween(0.62, 0.82)
      );
      this.state.flow_temperature_c = round(this.randomBetween(37, 39.5), 1);
      this.state.operating_mode_code = 1;
    }

    const temperatureDelta = this.state.target_temperature_c - this.state.indoor_temperature_c;
    this.state.indoor_temperature_c = round(
      this.state.indoor_temperature_c + temperatureDelta * this.randomBetween(0.015, 0.045),
      1
    );

    return super.tick(timestamp);
  }

  getData() {
    return {
      heat_pump_power_kw: {
        value: round(this.state.heating_power_kw),
        unit: "kW"
      },
      indoor_temperature_c: {
        value: round(this.state.indoor_temperature_c, 1),
        unit: "C"
      },
      target_temperature_c: {
        value: round(this.state.target_temperature_c, 1),
        unit: "C"
      },
      flow_temperature_c: {
        value: round(this.state.flow_temperature_c, 1),
        unit: "C"
      },
      operating_mode_code: {
        value: this.state.operating_mode_code,
        unit: "state_code"
      }
    };
  }

  applyCommand(action, body = {}, timestamp = new Date().toISOString()) {
    if (action === "reduce_load") {
      this.state.operating_state = "reduced";
    } else if (action === "restore_load") {
      this.state.operating_state = "heating";
    } else if (action === "boost_heat") {
      this.state.operating_state = "boost";
    } else if (action === "set_temperature" && Number.isFinite(Number(body.target_temperature_c))) {
      this.state.target_temperature_c = round(body.target_temperature_c, 1);
    }

    return super.applyCommand(action, body, timestamp);
  }
}

function createHeatPumpDevice(options = {}) {
  return new HeatPumpDevice(options);
}

module.exports = {
  HEAT_PUMP_ACTIONS,
  HeatPumpDevice,
  createHeatPumpDevice
};
