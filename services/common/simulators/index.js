"use strict";

const { BaseDevice, round } = require("./base-device");
const { SHELLY_ACTIONS, ShellyPlugDevice, createShellyPlugDevice } = require("./shelly-plug-device");
const { ENODE_ACTIONS, EnodeEaseeDevice, createEnodeEaseeDevice } = require("./enode-easee-device");
const { HEAT_PUMP_ACTIONS, HeatPumpDevice, createHeatPumpDevice } = require("./heat-pump-device");
const {
  DEVICE_CATALOG,
  HouseholdDevice,
  STATE_CODES,
  createHouseholdDevice
} = require("./household-device");

module.exports = {
  BaseDevice,
  DEVICE_CATALOG,
  ENODE_ACTIONS,
  EnodeEaseeDevice,
  HEAT_PUMP_ACTIONS,
  HeatPumpDevice,
  HouseholdDevice,
  SHELLY_ACTIONS,
  ShellyPlugDevice,
  STATE_CODES,
  createEnodeEaseeDevice,
  createHeatPumpDevice,
  createHouseholdDevice,
  createShellyPlugDevice,
  round
};
