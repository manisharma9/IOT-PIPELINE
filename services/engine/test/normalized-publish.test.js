"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildCorrelationId,
  buildNormalizedTelemetryEvent,
  buildNormalizedTelemetryMessages
} = require("../src/normalized-publisher");

const normalizedRow = {
  event_time: "2026-05-24T17:00:00.000Z",
  household_id: "household-001",
  community_id: "community-dublin-north",
  device_id: "meter-001",
  device_type: "smart_meter",
  reading_name: "active_power_kw",
  reading_value: 1.42,
  reading_unit: "kW",
  protocol: "http",
  source: "household-gateway"
};

test("engine builds correlation id from Kafka metadata", () => {
  assert.equal(
    buildCorrelationId({ topic: "raw.telemetry", partition: 0, offset: 12 }),
    "raw.telemetry:0:12"
  );
});

test("engine prefers a producer correlation id for idempotent retries", () => {
  assert.equal(
    buildCorrelationId(
      { topic: "raw.telemetry", partition: 0, offset: 12 },
      { correlation_id: "scale-correlation-001" }
    ),
    "scale-correlation-001"
  );
});

test("engine builds normalized telemetry event for Kafka", () => {
  const event = buildNormalizedTelemetryEvent(normalizedRow, "raw.telemetry:0:12");

  assert.equal(event.reading_name, "active_power_kw");
  assert.equal(event.reading_value, 1.42);
  assert.equal(event.correlation_id, "raw.telemetry:0:12");
});

test("engine builds one Kafka message per normalized row", () => {
  const messages = buildNormalizedTelemetryMessages([normalizedRow], "raw.telemetry:0:12");

  assert.equal(messages.length, 1);
  assert.equal(
    messages[0].key,
    "community-dublin-north/household-001/meter-001"
  );
  const event = JSON.parse(messages[0].value);
  assert.deepEqual(event, {
    ...normalizedRow,
    reading_id: event.reading_id,
    correlation_id: "raw.telemetry:0:12"
  });
  assert.match(event.reading_id, /^reading_[a-f0-9]{64}$/);
});
