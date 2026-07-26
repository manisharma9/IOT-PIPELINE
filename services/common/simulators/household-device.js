"use strict";

const { BaseDevice, round } = require("./base-device");

const DEVICE_CATALOG = Object.freeze({
  smart_meter: {
    displayName: "Smart meter",
    provider: "simulated_meter",
    powerRangeKw: [0.8, 7.5],
    baseEnergyKwh: 4200,
    states: ["monitoring"],
    readings: "meter"
  },
  refrigerator: {
    displayName: "Refrigerator",
    provider: "simulated_appliance",
    powerRangeKw: [0.06, 0.18],
    baseEnergyKwh: 310,
    states: ["cooling", "idle"],
    readings: "appliance"
  },
  washing_machine: {
    displayName: "Washing machine",
    provider: "simulated_appliance",
    powerRangeKw: [0, 1.9],
    baseEnergyKwh: 166,
    states: ["idle", "washing", "rinsing", "spinning"],
    readings: "appliance",
    flexible: true,
    maxFlexiblePowerKw: 1.8
  },
  clothes_dryer: {
    displayName: "Clothes dryer",
    provider: "simulated_appliance",
    powerRangeKw: [0, 2.6],
    baseEnergyKwh: 208,
    states: ["idle", "drying", "cool_down"],
    readings: "appliance",
    flexible: true,
    maxFlexiblePowerKw: 2.4
  },
  dishwasher: {
    displayName: "Dishwasher",
    provider: "simulated_appliance",
    powerRangeKw: [0, 1.7],
    baseEnergyKwh: 189,
    states: ["idle", "washing", "drying"],
    readings: "appliance",
    flexible: true,
    maxFlexiblePowerKw: 1.5
  },
  lighting_circuit: {
    displayName: "Lighting circuit",
    provider: "simulated_lighting",
    powerRangeKw: [0.03, 0.42],
    baseEnergyKwh: 244,
    states: ["off", "dimmed", "on"],
    readings: "appliance",
    flexible: true,
    maxFlexiblePowerKw: 0.2
  },
  thermostat_hvac: {
    displayName: "Thermostat and HVAC",
    provider: "simulated_hvac",
    powerRangeKw: [0.25, 2.2],
    baseEnergyKwh: 1010,
    states: ["idle", "heating", "cooling"],
    readings: "thermostat",
    flexible: true,
    maxFlexiblePowerKw: 1.2
  },
  water_heater: {
    displayName: "Water heater",
    provider: "simulated_water_heater",
    powerRangeKw: [0, 3],
    baseEnergyKwh: 820,
    states: ["idle", "heating", "holding"],
    readings: "water_heater",
    flexible: true,
    maxFlexiblePowerKw: 2.5
  },
  solar_inverter: {
    displayName: "Solar inverter",
    provider: "simulated_solar",
    powerRangeKw: [0, 5.5],
    baseEnergyKwh: 3100,
    states: ["standby", "generating", "exporting"],
    readings: "solar",
    flexible: true,
    maxFlexiblePowerKw: 2
  },
  home_battery: {
    displayName: "Home battery",
    provider: "simulated_battery",
    powerRangeKw: [-3.5, 3.5],
    baseEnergyKwh: 1450,
    states: ["idle", "charging", "discharging"],
    readings: "battery",
    flexible: true,
    maxFlexiblePowerKw: 3.5
  }
});

const STATE_CODES = Object.freeze({
  idle: 0,
  monitoring: 1,
  cooling: 2,
  washing: 3,
  rinsing: 4,
  spinning: 5,
  drying: 6,
  cool_down: 7,
  off: 8,
  dimmed: 9,
  on: 10,
  heating: 11,
  holding: 12,
  standby: 13,
  generating: 14,
  exporting: 15,
  charging: 16,
  discharging: 17
});

class HouseholdDevice extends BaseDevice {
  constructor(options = {}) {
    const definition = DEVICE_CATALOG[options.deviceType];
    if (!definition) {
      throw new Error(`Unsupported household device category: ${options.deviceType}`);
    }

    const initialState = definition.states[0];
    super({
      deviceId: options.deviceId,
      deviceType: options.deviceType,
      provider: definition.provider,
      communityId: options.communityId,
      householdId: options.householdId,
      areaId: options.areaId,
      controllableLoadKw: definition.maxFlexiblePowerKw || 0,
      supportedActions: [],
      random: options.random,
      initialState: {
        display_name: options.displayName || definition.displayName,
        operating_state: initialState,
        operating_state_code: STATE_CODES[initialState],
        current_power_kw: 0,
        cumulative_energy_kwh:
          Number(options.initialEnergyKwh) ||
          definition.baseEnergyKwh + Math.round((options.random?.() || 0.5) * 300),
        flexibility_capable: Boolean(definition.flexible),
        maximum_flexible_power_kw: Number(definition.maxFlexiblePowerKw || 0),
        indoor_temperature_c: 20.5,
        target_temperature_c: 21,
        water_temperature_c: 51,
        battery_soc_percent: 62
      }
    });
    this.definition = definition;
  }

  tick(timestamp = new Date().toISOString()) {
    const elapsedHours = this.elapsedHours(timestamp, 60);
    const stateIndex = Math.floor(this.random() * this.definition.states.length);
    const state = this.definition.states[stateIndex];
    const [minimum, maximum] = this.definition.powerRangeKw;
    let currentPower = this.randomBetween(minimum, maximum);

    if (state === "idle" || state === "off" || state === "standby") {
      currentPower = Math.max(0, Math.min(0.08, Math.abs(currentPower) * 0.08));
    }
    if (this.deviceType === "home_battery") {
      currentPower = state === "discharging"
        ? -Math.abs(currentPower)
        : state === "charging"
          ? Math.abs(currentPower)
          : 0;
      this.state.battery_soc_percent = round(
        Math.max(15, Math.min(95, this.state.battery_soc_percent + currentPower * elapsedHours * 8)),
        1
      );
    }

    this.state.operating_state = state;
    this.state.operating_state_code = STATE_CODES[state];
    this.state.current_power_kw = round(currentPower);
    this.state.cumulative_energy_kwh = round(
      this.state.cumulative_energy_kwh + Math.abs(currentPower) * elapsedHours,
      4
    );

    if (["thermostat_hvac", "water_heater"].includes(this.deviceType)) {
      this.state.indoor_temperature_c = round(
        Math.max(17, Math.min(24, this.state.indoor_temperature_c + this.randomBetween(-0.12, 0.12))),
        1
      );
      this.state.target_temperature_c = round(
        Math.max(18, Math.min(23, this.state.target_temperature_c + this.randomBetween(-0.05, 0.05))),
        1
      );
    }
    if (this.deviceType === "water_heater") {
      this.state.water_temperature_c = round(
        Math.max(43, Math.min(62, this.state.water_temperature_c + this.randomBetween(-0.6, 0.8))),
        1
      );
    }

    return super.tick(timestamp);
  }

  getData() {
    const common = {
      operating_state_code: {
        value: this.state.operating_state_code,
        unit: "state_code"
      }
    };

    if (this.definition.readings === "meter") {
      return {
        active_power_kw: { value: round(this.state.current_power_kw), unit: "kW" },
        energy_import_kwh: { value: round(this.state.cumulative_energy_kwh, 4), unit: "kWh" },
        voltage_v: { value: round(this.randomBetween(228, 238), 1), unit: "V" },
        ...common
      };
    }
    if (this.definition.readings === "thermostat") {
      return {
        active_power_kw: { value: round(this.state.current_power_kw), unit: "kW" },
        energy_import_kwh: { value: round(this.state.cumulative_energy_kwh, 4), unit: "kWh" },
        indoor_temperature_c: { value: this.state.indoor_temperature_c, unit: "C" },
        target_temperature_c: { value: this.state.target_temperature_c, unit: "C" },
        ...common
      };
    }
    if (this.definition.readings === "water_heater") {
      return {
        active_power_kw: { value: round(this.state.current_power_kw), unit: "kW" },
        energy_import_kwh: { value: round(this.state.cumulative_energy_kwh, 4), unit: "kWh" },
        water_temperature_c: { value: this.state.water_temperature_c, unit: "C" },
        target_temperature_c: { value: 55, unit: "C" },
        ...common
      };
    }
    if (this.definition.readings === "solar") {
      return {
        pv_generation_kw: { value: round(Math.max(0, this.state.current_power_kw)), unit: "kW" },
        energy_export_kwh: { value: round(this.state.cumulative_energy_kwh, 4), unit: "kWh" },
        ...common
      };
    }
    if (this.definition.readings === "battery") {
      return {
        battery_power_kw: { value: round(this.state.current_power_kw), unit: "kW" },
        battery_soc_percent: { value: this.state.battery_soc_percent, unit: "%" },
        energy_throughput_kwh: { value: round(this.state.cumulative_energy_kwh, 4), unit: "kWh" },
        ...common
      };
    }

    return {
      active_power_kw: { value: round(this.state.current_power_kw), unit: "kW" },
      energy_import_kwh: { value: round(this.state.cumulative_energy_kwh, 4), unit: "kWh" },
      ...common
    };
  }

  getInventory() {
    return {
      device_id: this.deviceId,
      household_id: this.householdId,
      community_id: this.communityId,
      area_id: this.areaId,
      device_category: this.deviceType,
      display_name: this.state.display_name,
      provider: this.provider,
      flexibility_capable: this.state.flexibility_capable,
      maximum_flexible_power_kw: this.state.maximum_flexible_power_kw,
      simulated: true,
      no_real_execution: true
    };
  }
}

function createHouseholdDevice(options) {
  return new HouseholdDevice(options);
}

module.exports = {
  DEVICE_CATALOG,
  HouseholdDevice,
  STATE_CODES,
  createHouseholdDevice
};

