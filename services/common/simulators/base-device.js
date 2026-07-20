"use strict";

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

class BaseDevice {
  constructor({
    deviceId,
    deviceType,
    provider = "simulated",
    communityId = "community-dublin-north",
    householdId = "household-simulated",
    areaId = "dublin-north",
    controllableLoadKw = 0,
    supportedActions = [],
    initialState = {},
    random = Math.random
  }) {
    this.deviceId = deviceId;
    this.deviceType = deviceType;
    this.provider = provider;
    this.communityId = communityId;
    this.householdId = householdId;
    this.areaId = areaId;
    this.controllableLoadKw = Number(controllableLoadKw || 0);
    this.supportedActions = [...supportedActions];
    this.random = typeof random === "function" ? random : Math.random;
    this.state = {
      online: true,
      simulated: true,
      no_real_execution: true,
      last_tick_at: null,
      last_command_at: null,
      ...initialState
    };
  }

  randomBetween(minimum, maximum) {
    return Number(minimum) + this.random() * (Number(maximum) - Number(minimum));
  }

  elapsedHours(timestamp, fallbackSeconds = 5) {
    const current = Date.parse(timestamp);
    const previous = this.state.last_tick_at ? Date.parse(this.state.last_tick_at) : NaN;
    const elapsedSeconds = Number.isFinite(current) && Number.isFinite(previous)
      ? Math.max(0.25, Math.min(3600, (current - previous) / 1000))
      : fallbackSeconds;

    return elapsedSeconds / 3600;
  }

  tick(timestamp = new Date().toISOString()) {
    this.state.last_tick_at = timestamp;
    return this.getStatus(timestamp);
  }

  getData() {
    return {};
  }

  getStatus(timestamp = new Date().toISOString()) {
    return {
      device_id: this.deviceId,
      deviceId: this.deviceId,
      device_type: this.deviceType,
      deviceType: this.deviceType,
      provider: this.provider,
      community_id: this.communityId,
      communityId: this.communityId,
      household_id: this.householdId,
      householdId: this.householdId,
      area_id: this.areaId,
      areaId: this.areaId,
      controllable_load_kw: round(this.controllableLoadKw),
      supported_actions: [...this.supportedActions],
      timestamp,
      ...this.state
    };
  }

  getTelemetry(timestamp = new Date().toISOString()) {
    this.tick(timestamp);
    const data = this.getData();

    return {
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      timestamp,
      data,
      communityId: this.communityId,
      householdId: this.householdId,
      areaId: this.areaId,
      device_id: this.deviceId,
      device_type: this.deviceType,
      community_id: this.communityId,
      household_id: this.householdId,
      area_id: this.areaId,
      readings: data,
      protocol: "http",
      source: `${this.deviceType}-simulator`,
      simulated: true,
      no_real_execution: true
    };
  }

  applyCommand(action, body = {}, timestamp = new Date().toISOString()) {
    if (!this.supportedActions.includes(action)) {
      return {
        accepted: false,
        error: "unsupported_device_action",
        supported_actions: [...this.supportedActions],
        simulated: true,
        no_real_execution: true,
        timestamp
      };
    }

    this.state.last_command_at = timestamp;
    this.state.last_action = action;

    return {
      device_id: body.device_id || this.deviceId,
      deviceId: body.deviceId || body.device_id || this.deviceId,
      device_type: this.deviceType,
      deviceType: this.deviceType,
      provider: this.provider,
      action,
      requested_reduction_kw:
        body.requested_reduction_kw === undefined ? null : round(body.requested_reduction_kw),
      accepted: true,
      simulated: true,
      no_real_execution: true,
      execution_mode: `simulated_${this.provider}_api`,
      timestamp,
      telemetry: this.getTelemetry(timestamp)
    };
  }
}

module.exports = {
  BaseDevice,
  round
};
