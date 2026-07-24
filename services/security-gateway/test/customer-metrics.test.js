"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildInsightFacts,
  calculateFlexibilityScore,
  normalizeAnalyticsRange,
  normalizePagination
} = require("../src/customer-metrics");

test("analytics ranges are bounded to 31 days", () => {
  const range = normalizeAnalyticsRange({
    range: "custom",
    start: "2025-01-01T00:00:00.000Z",
    end: "2026-07-24T00:00:00.000Z"
  });
  const durationDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;

  assert.equal(durationDays, 31);
  assert.equal(range.bucket, "6 hours");
});

test("device pagination is bounded for browser-safe responses", () => {
  assert.deepEqual(normalizePagination(5000, -4), { limit: 50, offset: 0 });
});

test("flexibility score returns not enough data instead of a fabricated score", () => {
  const score = calculateFlexibilityScore({
    deviceCount: 1,
    eligibleDevices: 0,
    eventCount: 0
  });

  assert.equal(score.available, false);
  assert.equal(score.score, null);
  assert.equal(score.reason, "Not enough data yet");
});

test("flexibility score is explainable and bounded when data exists", () => {
  const score = calculateFlexibilityScore({
    deviceCount: 3,
    eligibleDevices: 3,
    currentPowerKw: 6,
    flexibleLoadKw: 3,
    eventCount: 2,
    successfulEvents: 2,
    hasEv: true,
    hasHeatPump: true
  });

  assert.equal(score.available, true);
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.equal(score.components.length, 5);
  assert.equal(
    score.components.reduce((sum, component) => sum + component.points, 0),
    score.score
  );
});

test("insight facts contain only aggregate verifiable metrics", () => {
  const facts = buildInsightFacts({
    summary: { flexible_load_available_kw: 2.5 },
    analytics: {
      points: [{
        bucket_start: "2026-07-24T10:00:00.000Z",
        total_power_kw: 5,
        smart_plug_power_kw: 0.5,
        ev_charger_power_kw: 3.5,
        heat_pump_power_kw: 1
      }]
    },
    community: {
      comparison_available: true,
      selected_household_percentile: 60
    },
    flexibility: {
      latest_event: { status: "reviewed", target_kw: 2.5 }
    }
  });

  assert.deepEqual(facts.peak_period, {
    timestamp: "2026-07-24T10:00:00.000Z",
    total_power_kw: 5
  });
  assert.deepEqual(facts.peak_device_type, {
    device_type: "ev_charger",
    power_kw: 3.5
  });
  assert.equal(JSON.stringify(facts).includes("household_id"), false);
});

