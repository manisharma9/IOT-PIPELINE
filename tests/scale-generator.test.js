"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  allocateDeviceTypes,
  createSeededRandom,
  createTelemetryEnvelope,
  createVirtualDevices,
  resolveConfig,
  runScaleGenerator,
  sendTelemetry
} = require("../scripts/run-scale-validation");
const {
  buildScaleOutProjection
} = require("../scripts/build-scalability-evidence");

const baseConfig = require("../config/scalability-10000.example.json");
const exactConfig = require("../config/scale-1000-assets.json");

test("device allocation represents exactly 10,000 mixed devices", () => {
  const types = allocateDeviceTypes(10000, baseConfig.device_distribution);
  assert.equal(types.length, 10000);
  assert.equal(types.includes("shelly_plug"), true);
  assert.equal(types.includes("ev_charger"), true);
  assert.equal(types.includes("heat_pump"), true);
});

test("seeded random sequence is reproducible", () => {
  const first = createSeededRandom(20305);
  const second = createSeededRandom(20305);
  assert.deepEqual(
    Array.from({ length: 20 }, () => first()),
    Array.from({ length: 20 }, () => second())
  );
});

test("virtual population has unique devices and bounded household identities", () => {
  const config = resolveConfig(baseConfig, { devices: 1000, households: 334, cycles: 1 });
  const devices = createVirtualDevices(config);
  assert.equal(devices.length, 1000);
  assert.equal(new Set(devices.map((device) => device.deviceId)).size, 1000);
  assert.equal(new Set(devices.map((device) => device.householdId)).size, 334);
  assert.equal(devices.every((device) => device.state.no_real_execution === true), true);
});

test("independent devices produce realistic changing telemetry and unique reading IDs", () => {
  const config = resolveConfig(baseConfig, { devices: 3, households: 1, cycles: 2, seed: 42 });
  const devices = createVirtualDevices(config);
  const timestampOne = "2026-07-20T12:00:00.000Z";
  const timestampTwo = "2026-07-20T12:01:00.000Z";
  const first = createTelemetryEnvelope(devices[0], 0, config, timestampOne);
  const second = createTelemetryEnvelope(devices[0], 1, config, timestampTwo);
  assert.notDeepEqual(first.payload.readings, second.payload.readings);
  assert.notEqual(first.messageId, second.messageId);
  assert.notEqual(first.correlationId, second.correlationId);
  assert.equal(new Set(Object.values(first.readingIds)).size, Object.keys(first.payload.readings).length);
  assert.equal(first.payload.source.startsWith("scale-"), true);
});

test("dry-run generator streams evidence and keeps gateway success separate from end-to-end success", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "adflex-scale-test-"));
  const config = resolveConfig(baseConfig, {
    devices: 20,
    households: 7,
    cycles: 1,
    targetRate: 1000,
    rampUpSeconds: 0,
    concurrency: 4,
    output: directory,
    dryRun: true
  });
  const summary = await runScaleGenerator(config);
  assert.equal(summary.telemetry_attempted, 20);
  assert.equal(summary.telemetry_gateway_accepted, 20);
  assert.equal(summary.represented_devices, 20);
  assert.equal(summary.represented_households, 7);
  assert.equal(summary.end_to_end_validated, false);
  assert.equal(fs.existsSync(path.join(summary.output_directory, "generator-events.jsonl")), true);
  assert.equal(fs.existsSync(path.join(summary.output_directory, "generator-summary.json")), true);
});

test("exact stage populations match every requested household and asset count", () => {
  const expected = [
    [100, 10],
    [250, 25],
    [500, 50],
    [1000, 100]
  ];
  for (const [assetCount, householdCount] of expected) {
    const config = resolveConfig(exactConfig, {
      devices: assetCount,
      cycles: 1
    });
    const devices = createVirtualDevices(config);
    assert.equal(devices.length, assetCount);
    assert.equal(
      new Set(devices.map((device) => device.householdId)).size,
      householdCount
    );
    assert.equal(new Set(devices.map((device) => device.deviceId)).size, assetCount);
  }
});

test("1,000-asset envelope sends one SLM reading and preserves safe device context", () => {
  const config = resolveConfig(exactConfig, {
    devices: 1000,
    cycles: 1
  });
  const device = createVirtualDevices(config)[0];
  const envelope = createTelemetryEnvelope(
    device,
    0,
    config,
    "2026-07-27T10:00:00.000Z"
  );

  assert.equal(Object.keys(envelope.payload.readings).length, 1);
  assert.equal(envelope.payload.metadata.household_profile, "apartment");
  assert.equal(envelope.payload.metadata.simulated, true);
  assert.equal(envelope.payload.metadata.no_real_execution, true);
  assert.ok(envelope.payload.metadata.selected_primary_field);
  assert.ok(envelope.payload.metadata.measurement_capabilities.length >= 2);
  assert.equal(envelope.payload.message_id, envelope.messageId);
  assert.equal(envelope.payload.correlation_id, envelope.correlationId);
  assert.deepEqual(envelope.payload.reading_ids, envelope.readingIds);
});

test("gateway transport retry reuses the idempotent telemetry envelope", async () => {
  const config = resolveConfig(exactConfig, { devices: 100, cycles: 1 });
  config.gateway.max_retries = 2;
  config.gateway.retry_backoff_ms = 1;
  const envelope = createTelemetryEnvelope(
    createVirtualDevices(config)[0],
    0,
    config,
    "2026-07-27T10:00:00.000Z"
  );
  const requestBodies = [];
  const fetchImpl = async (_url, options) => {
    requestBodies.push(options.body);
    if (requestBodies.length === 1) {
      throw new TypeError("fetch failed", { cause: { code: "UND_ERR_SOCKET" } });
    }
    return new Response(JSON.stringify({ status: "accepted" }), {
      status: 202,
      headers: { "content-type": "application/json" }
    });
  };

  const result = await sendTelemetry(envelope, config, fetchImpl);

  assert.equal(result.statusCode, 202);
  assert.equal(result.attempts, 2);
  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[0], requestBodies[1]);
});

test("coverage configuration keeps complete device readings for validator coverage", () => {
  const config = resolveConfig(exactConfig, {
    devices: 100,
    cycles: 1,
    primaryReadingMode: "false",
    maxMessages: 100
  });
  const device = createVirtualDevices(config)[0];
  const envelope = createTelemetryEnvelope(
    device,
    0,
    config,
    "2026-07-27T10:00:00.000Z"
  );

  assert.equal(config.primary_reading_mode, false);
  assert.equal(config.max_messages, 100);
  assert.ok(Object.keys(envelope.payload.readings).length > 1);
  assert.equal(envelope.payload.metadata.simulated, true);
  assert.equal(envelope.payload.metadata.no_real_execution, true);
});

test("scale-out projection is derived from measured completion throughput", () => {
  const projection = buildScaleOutProjection({
    run_id: "measured-1000",
    pipeline: { completion_readings_per_second: 0.424 }
  }, {
    populations: [10000],
    reportingIntervalSeconds: 900,
    planningMargin: 1.3
  });

  assert.equal(projection.status, "modeled_not_validated");
  assert.equal(projection.scenarios[0].semantic_readings_per_second, 11.1111);
  assert.equal(projection.scenarios[0].local_worker_capacity_equivalents, 35);
  assert.equal(projection.scenarios[1].semantic_readings_per_second, 33.3333);
  assert.equal(projection.scenarios[1].local_worker_capacity_equivalents, 103);
});

test("controlled burst releases the configured cohort through bounded concurrency", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "adflex-burst-test-"));
  const config = resolveConfig(exactConfig, {
    devices: 100,
    cycles: 1,
    mode: "burst",
    burstAssets: 50,
    targetRate: 0.01,
    reportingWindowSeconds: 600,
    concurrency: 4,
    maxMessages: 50,
    output: directory,
    dryRun: true
  });

  const summary = await runScaleGenerator(config);

  assert.equal(summary.telemetry_gateway_accepted, 50);
  assert.equal(summary.represented_devices, 50);
  assert.equal(summary.bounded_concurrency, 4);
  assert.ok(summary.elapsed_seconds < 5);
});
