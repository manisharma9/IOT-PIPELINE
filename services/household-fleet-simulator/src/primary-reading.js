"use strict";

const PRIMARY_READING_ROTATIONS = Object.freeze({
  smart_meter: Object.freeze([
    "active_power_kw",
    "energy_import_kwh",
    "voltage_v",
    "operating_state_code"
  ]),
  smart_plug: Object.freeze([
    "active_power_kw",
    "voltage_v",
    "current_a",
    "energy_import_kwh"
  ]),
  shelly_plug: Object.freeze([
    "active_power_kw",
    "voltage_v",
    "current_a",
    "energy_import_kwh"
  ]),
  refrigerator: Object.freeze([
    "active_power_kw",
    "energy_import_kwh",
    "operating_state_code"
  ]),
  washing_machine: Object.freeze([
    "active_power_kw",
    "energy_import_kwh",
    "operating_state_code"
  ]),
  clothes_dryer: Object.freeze([
    "active_power_kw",
    "energy_import_kwh",
    "operating_state_code"
  ]),
  dishwasher: Object.freeze([
    "active_power_kw",
    "energy_import_kwh",
    "operating_state_code"
  ]),
  lighting_circuit: Object.freeze([
    "active_power_kw",
    "energy_import_kwh",
    "operating_state_code"
  ]),
  thermostat_hvac: Object.freeze([
    "indoor_temperature_c",
    "active_power_kw",
    "target_temperature_c",
    "operating_state_code"
  ]),
  water_heater: Object.freeze([
    "active_power_kw",
    "water_temperature_c",
    "energy_import_kwh",
    "operating_state_code"
  ]),
  ev_charger: Object.freeze([
    "ev_charging_power_kw",
    "energy_delivered_kwh",
    "charging_state_code"
  ]),
  heat_pump: Object.freeze([
    "heat_pump_power_kw",
    "indoor_temperature_c",
    "target_temperature_c",
    "flow_temperature_c",
    "operating_mode_code"
  ]),
  solar_inverter: Object.freeze([
    "pv_generation_kw",
    "energy_export_kwh",
    "operating_state_code"
  ]),
  home_battery: Object.freeze([
    "battery_soc_percent",
    "battery_power_kw",
    "energy_throughput_kwh",
    "operating_state_code"
  ])
});

function selectPrimaryReading(telemetry, cycle = 0) {
  const readings = telemetry?.readings || telemetry?.data || {};
  const available = Object.keys(readings);
  if (!available.length) {
    throw new Error(`Device ${telemetry?.device_id || telemetry?.deviceId || "unknown"} has no readings.`);
  }

  const deviceType = telemetry.device_type || telemetry.deviceType;
  const preferred = (PRIMARY_READING_ROTATIONS[deviceType] || available)
    .filter((field) => Object.prototype.hasOwnProperty.call(readings, field));
  const rotation = preferred.length ? preferred : available;
  const selectedField = rotation[Math.abs(Number(cycle) || 0) % rotation.length];

  return {
    field: selectedField,
    reading: readings[selectedField],
    readings: {
      [selectedField]: readings[selectedField]
    }
  };
}

module.exports = {
  PRIMARY_READING_ROTATIONS,
  selectPrimaryReading
};
