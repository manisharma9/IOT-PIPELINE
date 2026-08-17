"use strict";

const RANGE_PROFILES = Object.freeze({
  "24h": { hours: 24, bucket: "15 minutes", label: "Last 24 hours" },
  "7d": { hours: 24 * 7, bucket: "1 hour", label: "Last 7 days" },
  "30d": { hours: 24 * 30, bucket: "6 hours", label: "Last 30 days" }
});

const STATUS_LABELS = Object.freeze({
  proposed: "Opportunity received",
  reviewed: "Reviewed",
  approved: "Approved for preparation",
  rejected: "Not participating",
  ready_to_dispatch: "Ready for simulation",
  mock_sent: "Simulation sent",
  simulated_success: "Simulation completed",
  mock_result: "Simulation completed",
  accepted: "Accepted by simulator"
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function normalizePagination(limit, offset) {
  const parsedLimit = Math.floor(toNumber(limit, 20));
  const parsedOffset = Math.floor(toNumber(offset, 0));
  return {
    limit: Math.max(1, Math.min(50, parsedLimit)),
    offset: Math.max(0, parsedOffset)
  };
}

function normalizeAnalyticsRange(input = {}) {
  const profile = RANGE_PROFILES[input.range] || RANGE_PROFILES["24h"];
  const now = new Date();
  let end = input.end ? new Date(input.end) : now;
  let start = input.start ? new Date(input.start) : new Date(end.getTime() - profile.hours * 3600000);

  if (Number.isNaN(end.getTime())) end = now;
  if (Number.isNaN(start.getTime())) {
    start = new Date(end.getTime() - profile.hours * 3600000);
  }
  if (start >= end) {
    start = new Date(end.getTime() - profile.hours * 3600000);
  }

  const maximumMs = 31 * 24 * 3600000;
  if (end.getTime() - start.getTime() > maximumMs) {
    start = new Date(end.getTime() - maximumMs);
  }

  const durationHours = (end.getTime() - start.getTime()) / 3600000;
  const bucket = durationHours <= 36
    ? "15 minutes"
    : durationHours <= 24 * 8
      ? "1 hour"
      : "6 hours";

  return {
    range: RANGE_PROFILES[input.range] ? input.range : "custom",
    label: RANGE_PROFILES[input.range]?.label || "Custom range",
    start: start.toISOString(),
    end: end.toISOString(),
    bucket
  };
}

function customerStatus(status) {
  return STATUS_LABELS[String(status || "")] || "Status unavailable";
}

function operatingState(device) {
  const type = String(device.device_type || "");
  if (type === "ev_charger") {
    const code = toNumber(device.charging_state_code, -1);
    return code === 0 ? "Paused" : code === 1 ? "Charging" : code === 2 ? "Reduced charging" : "Status unavailable";
  }
  if (type === "heat_pump") {
    const code = toNumber(device.operating_mode_code, -1);
    return code === 1 ? "Heating" : code === 2 ? "Reduced output" : code === 3 ? "Boost heating" : "Status unavailable";
  }
  if (type === "shelly_plug") {
    return toNumber(device.current_power_kw) > 0.01 ? "On" : "Off or idle";
  }
  const genericStates = {
    0: "Idle",
    1: "Monitoring",
    2: "Cooling",
    3: "Washing",
    4: "Rinsing",
    5: "Spinning",
    6: "Drying",
    7: "Cooling down",
    8: "Off",
    9: "Dimmed",
    10: "On",
    11: "Heating",
    12: "Holding temperature",
    13: "Standby",
    14: "Generating",
    15: "Exporting",
    16: "Charging",
    17: "Discharging"
  };
  const code = toNumber(device.operating_state_code, -1);
  if (genericStates[code]) return genericStates[code];
  return Math.abs(toNumber(device.current_power_kw)) > 0.05 ? "Active" : "Idle";
}

function calculateFlexibilityScore(input = {}) {
  const deviceCount = toNumber(input.deviceCount);
  const eligibleDevices = toNumber(input.eligibleDevices);
  const currentPowerKw = toNumber(input.currentPowerKw);
  const flexibleLoadKw = toNumber(input.flexibleLoadKw);
  const eventCount = toNumber(input.eventCount);
  const successfulEvents = toNumber(input.successfulEvents);
  const hasEv = Boolean(input.hasEv);
  const hasHeatPump = Boolean(input.hasHeatPump);

  if (deviceCount < 2 || eligibleDevices < 1 || eventCount < 1) {
    return {
      available: false,
      score: null,
      reason: "Not enough data yet",
      components: []
    };
  }

  const controllableShare = currentPowerKw > 0
    ? Math.min(1, flexibleLoadKw / currentPowerKw)
    : 0;
  const availability = Math.min(1, eligibleDevices / deviceCount);
  const reliability = Math.min(1, successfulEvents / eventCount);
  const components = [
    { id: "controllable_load", label: "Controllable load", points: round(controllableShare * 30, 1), maximum: 30 },
    { id: "device_availability", label: "Device availability", points: round(availability * 25, 1), maximum: 25 },
    { id: "ev_flexibility", label: "EV flexibility", points: hasEv ? 15 : 0, maximum: 15 },
    { id: "heat_pump_flexibility", label: "Heat-pump flexibility", points: hasHeatPump ? 15 : 0, maximum: 15 },
    { id: "response_reliability", label: "Simulation reliability", points: round(reliability * 15, 1), maximum: 15 }
  ];
  return {
    available: true,
    score: round(components.reduce((sum, item) => sum + item.points, 0), 0),
    reason: null,
    components
  };
}

function buildInsightFacts({ summary, analytics, community, flexibility }) {
  const points = Array.isArray(analytics?.points) ? analytics.points : [];
  const peak = points.reduce((current, point) => (
    toNumber(point.total_power_kw) > toNumber(current?.total_power_kw) ? point : current
  ), null);
  const contributions = [
    ["smart_plug", toNumber(peak?.smart_plug_power_kw)],
    ["ev_charger", toNumber(peak?.ev_charger_power_kw)],
    ["heat_pump", toNumber(peak?.heat_pump_power_kw)]
  ].sort((left, right) => right[1] - left[1]);

  return {
    peak_period: peak ? {
      timestamp: peak.bucket_start,
      total_power_kw: round(peak.total_power_kw)
    } : null,
    peak_device_type: contributions[0][1] > 0 ? {
      device_type: contributions[0][0],
      power_kw: round(contributions[0][1])
    } : null,
    flexible_load: toNumber(summary?.flexible_load_available_kw) > 0 ? {
      flexible_load_kw: round(summary.flexible_load_available_kw)
    } : null,
    latest_event: flexibility?.latest_event ? {
      status: flexibility.latest_event.status,
      target_kw: round(flexibility.latest_event.target_kw)
    } : null,
    community_percentile: community?.comparison_available ? {
      percentile: round(community.selected_household_percentile, 0)
    } : null
  };
}

module.exports = {
  RANGE_PROFILES,
  STATUS_LABELS,
  buildInsightFacts,
  calculateFlexibilityScore,
  customerStatus,
  normalizeAnalyticsRange,
  normalizePagination,
  operatingState,
  round,
  toNumber
};
