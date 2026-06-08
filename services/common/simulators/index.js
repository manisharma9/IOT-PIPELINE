"use strict";

const { BaseDevice, round } = require("./base-device");
const { SHELLY_ACTIONS, ShellyPlugDevice, createShellyPlugDevice } = require("./shelly-plug-device");
const { ENODE_ACTIONS, EnodeEaseeDevice, createEnodeEaseeDevice } = require("./enode-easee-device");
const { HEAT_PUMP_ACTIONS, HeatPumpDevice, createHeatPumpDevice } = require("./heat-pump-device");

module.exports = {
  BaseDevice,
  ENODE_ACTIONS,
  EnodeEaseeDevice,
  HEAT_PUMP_ACTIONS,
  HeatPumpDevice,
  SHELLY_ACTIONS,
  ShellyPlugDevice,
  createEnodeEaseeDevice,
  createHeatPumpDevice,
  createShellyPlugDevice,
  round
};
