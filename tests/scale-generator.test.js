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
  runScaleGenerator
} = require("../scripts/run-scale-validation");

const baseConfig = require("../config/scalability-10000.example.json");

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
