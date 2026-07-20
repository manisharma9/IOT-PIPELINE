"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const { performance } = require("node:perf_hooks");
const {
  createEnodeEaseeDevice,
  createHeatPumpDevice,
  createShellyPlugDevice
} = require("../services/common/simulators");

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../config/scalability-10000.example.json");
const DEVICE_FACTORIES = Object.freeze({
  shelly_plug: createShellyPlugDevice,
  ev_charger: createEnodeEaseeDevice,
  heat_pump: createHeatPumpDevice
});

function parseArguments(argv = process.argv.slice(2)) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stableHash(value, length = 24) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function normalizeDistribution(distribution = {}) {
  const entries = Object.keys(DEVICE_FACTORIES).map((type) => [
    type,
    nonNegativeNumber(distribution[type], 0)
  ]);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    return [
      ["shelly_plug", 0.34],
      ["ev_charger", 0.33],
      ["heat_pump", 0.33]
    ];
  }
  return entries.map(([type, weight]) => [type, weight / total]);
}

function allocateDeviceTypes(deviceCount, distribution) {
  const normalized = normalizeDistribution(distribution);
  const allocations = normalized.map(([type, weight]) => ({
    type,
    count: Math.floor(deviceCount * weight),
    remainder: deviceCount * weight - Math.floor(deviceCount * weight)
  }));
  let remaining = deviceCount - allocations.reduce((sum, item) => sum + item.count, 0);
  allocations.sort((left, right) => right.remainder - left.remainder || left.type.localeCompare(right.type));
  for (let index = 0; index < remaining; index += 1) {
    allocations[index % allocations.length].count += 1;
  }
  allocations.sort((left, right) => left.type.localeCompare(right.type));

  const types = [];
  while (types.length < deviceCount) {
    for (const allocation of allocations) {
      if (allocation.count > 0) {
        types.push(allocation.type);
        allocation.count -= 1;
      }
    }
  }
  return types;
}

function createDeviceId(type, ordinal) {
  const prefix = type === "shelly_plug" ? "shelly-plug" : type === "ev_charger" ? "easee-core" : "heat-pump";
  return `${prefix}-${String(ordinal).padStart(6, "0")}`;
}

function createVirtualDevices(config) {
  const deviceCount = Math.floor(positiveNumber(config.device_count, 10000));
  const householdCount = Math.min(
    deviceCount,
    Math.floor(positiveNumber(config.household_count, Math.ceil(deviceCount / 3)))
  );
  const deviceTypes = allocateDeviceTypes(deviceCount, config.device_distribution);
  const typeOrdinals = new Map();
  const random = createSeededRandom(config.random_seed || 20305);

  return deviceTypes.map((deviceType, index) => {
    const ordinal = (typeOrdinals.get(deviceType) || 0) + 1;
    typeOrdinals.set(deviceType, ordinal);
    const householdOrdinal = (index % householdCount) + 1;
    const householdId = `scale-household-${String(householdOrdinal).padStart(5, "0")}`;
    const deviceId = createDeviceId(deviceType, ordinal);
    const deviceRandom = createSeededRandom(Math.floor(random() * 0xffffffff));
    const factory = DEVICE_FACTORIES[deviceType];
    const common = {
      deviceId,
      householdId,
      communityId: "community-dublin-north",
      areaId: `dublin-north-${String(((householdOrdinal - 1) % 20) + 1).padStart(2, "0")}`,
      random: deviceRandom
    };

    if (deviceType === "shelly_plug") {
      return factory({
        ...common,
        initialPowerKw: 0.25 + deviceRandom() * 1.2,
        initialVoltageV: 228 + deviceRandom() * 8,
        initialEnergyKwh: 20 + deviceRandom() * 400
      });
    }
    if (deviceType === "ev_charger") {
      return factory({
        ...common,
        initialPowerKw: 3.2 + deviceRandom() * 4,
        initialEnergyKwh: 2 + deviceRandom() * 45
      });
    }
    return factory({
      ...common,
      initialPowerKw: 1.1 + deviceRandom() * 1.9,
      initialIndoorTemperatureC: 18.5 + deviceRandom() * 3.5,
      targetTemperatureC: 20.5 + deviceRandom() * 1.5
    });
  });
}

function createMessageIdentity({ scenarioId, cycle, deviceId, timestamp }) {
  const identity = `${scenarioId}:${cycle}:${deviceId}:${timestamp}`;
  return {
    messageId: `msg_${stableHash(identity, 28)}`,
    correlationId: `scale-${stableHash(`correlation:${identity}`, 28)}`
  };
}

function createReadingIds({ scenarioId, cycle, deviceId, timestamp, readings }) {
  return Object.fromEntries(
    Object.keys(readings).map((field) => [
      field,
      `reading_${stableHash(`${scenarioId}:${cycle}:${deviceId}:${field}:${timestamp}`, 32)}`
    ])
  );
}

function createTelemetryEnvelope(device, cycle, config, timestamp = new Date().toISOString()) {
  const telemetry = device.getTelemetry(timestamp);
  const identity = createMessageIdentity({
    scenarioId: config.scenario_id,
    cycle,
    deviceId: telemetry.device_id,
    timestamp
  });
  const readingIds = createReadingIds({
    scenarioId: config.scenario_id,
    cycle,
    deviceId: telemetry.device_id,
    timestamp,
    readings: telemetry.readings
  });

  return {
    messageId: identity.messageId,
    correlationId: identity.correlationId,
    readingIds,
    payload: {
      household_id: telemetry.household_id,
      community_id: telemetry.community_id,
      device_id: telemetry.device_id,
      device_type: telemetry.device_type,
      timestamp: telemetry.timestamp,
      readings: telemetry.readings,
      protocol: "http",
      source: `scale-${telemetry.device_type}-simulator`
    }
  };
}

function resolveConfig(baseConfig, overrides = {}) {
  const intervalSeconds = positiveNumber(overrides.intervalSeconds, baseConfig.reporting_interval_seconds);
  const durationMinutes = positiveNumber(overrides.durationMinutes, baseConfig.test_duration_minutes);
  const deviceCount = Math.floor(positiveNumber(overrides.devices, baseConfig.device_count));
  const configuredCycles = overrides.cycles === undefined
    ? Math.max(1, Math.floor((durationMinutes * 60) / intervalSeconds))
    : Math.floor(positiveNumber(overrides.cycles, baseConfig.cycles));
  const derivedRate = deviceCount / intervalSeconds;

  return {
    ...baseConfig,
    device_count: deviceCount,
    household_count: Math.floor(positiveNumber(overrides.households, baseConfig.household_count)),
    reporting_interval_seconds: intervalSeconds,
    test_duration_minutes: durationMinutes,
    random_seed: Math.floor(positiveNumber(overrides.seed, baseConfig.random_seed)),
    ramp_up_seconds: nonNegativeNumber(overrides.rampUpSeconds, baseConfig.ramp_up_seconds),
    burst_percentage: nonNegativeNumber(overrides.burstPercentage, baseConfig.burst_percentage),
    cycles: configuredCycles,
    target_telemetry_rate_per_second: positiveNumber(overrides.targetRate, derivedRate),
    maximum_permitted_backlog_readings: Math.floor(
      positiveNumber(overrides.maxBacklog, baseConfig.maximum_permitted_backlog_readings)
    ),
    mode: String(overrides.mode || baseConfig.mode || "ramp").toLowerCase(),
    gateway: {
      ...baseConfig.gateway,
      base_url: overrides.gatewayUrl || baseConfig.gateway.base_url,
      concurrency: Math.floor(positiveNumber(overrides.concurrency, baseConfig.gateway.concurrency)),
      request_timeout_ms: Math.floor(
        positiveNumber(overrides.requestTimeoutMs, baseConfig.gateway.request_timeout_ms)
      )
    },
    evidence: {
      ...baseConfig.evidence,
      output_location: overrides.output || baseConfig.evidence.output_location
    },
    dry_run: Boolean(overrides.dryRun),
    max_messages: overrides.maxMessages === undefined
      ? null
      : Math.floor(positiveNumber(overrides.maxMessages, deviceCount * configuredCycles))
  };
}

function createRunDirectory(outputLocation, scenarioId, now = new Date()) {
  const safeTime = now.toISOString().replace(/[:.]/g, "-");
  const directory = path.resolve(outputLocation, `${scenarioId}-${safeTime}`);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

async function writeJsonLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) {
    await once(stream, "drain");
  }
}

function createJsonLineWriter(stream) {
  let tail = Promise.resolve();
  return {
    write(value) {
      const operation = tail.then(() => writeJsonLine(stream, value));
      tail = operation.catch(() => {});
      return operation;
    },
    flush() {
      return tail;
    }
  };
}

function currentRate(config, elapsedSeconds, random) {
  let rate = config.target_telemetry_rate_per_second;
  if (config.mode === "ramp" && config.ramp_up_seconds > 0) {
    rate *= Math.max(0.02, Math.min(1, elapsedSeconds / config.ramp_up_seconds));
  }
  if (config.mode === "burst" && random() < 0.05) {
    rate *= 1 + config.burst_percentage / 100;
  }
  return Math.max(0.1, rate);
}

async function sendTelemetry(envelope, config, fetchImpl = globalThis.fetch) {
  if (config.dry_run) {
    return { statusCode: 202, elapsedMs: 0, body: { status: "dry_run_accepted" } };
  }
  const started = performance.now();
  const response = await fetchImpl(
    `${config.gateway.base_url.replace(/\/$/, "")}${config.gateway.telemetry_path}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-api-key": process.env.EDGE_API_KEY || "local-dev-edge-key",
        "x-correlation-id": envelope.correlationId
      },
      body: JSON.stringify(envelope.payload),
      signal: AbortSignal.timeout(config.gateway.request_timeout_ms)
    }
  );
  const body = await response.json().catch(() => ({}));
  return {
    statusCode: response.status,
    elapsedMs: performance.now() - started,
    body
  };
}

function summarizeLatencies(values) {
  if (!values.length) return { minimum_ms: null, average_ms: null, maximum_ms: null };
  return {
    minimum_ms: Math.min(...values),
    average_ms: values.reduce((sum, value) => sum + value, 0) / values.length,
    maximum_ms: Math.max(...values)
  };
}

async function runScaleGenerator(config, options = {}) {
  const devices = options.devices || createVirtualDevices(config);
  const totalAvailable = devices.length * config.cycles;
  const totalMessages = Math.min(totalAvailable, config.max_messages || totalAvailable);
  const runDirectory = options.runDirectory || createRunDirectory(
    config.evidence.output_location,
    config.scenario_id
  );
  fs.writeFileSync(path.join(runDirectory, "resolved-config.json"), `${JSON.stringify(config, null, 2)}\n`);
  const events = fs.createWriteStream(path.join(runDirectory, "generator-events.jsonl"), { flags: "a" });
  const resources = fs.createWriteStream(path.join(runDirectory, "generator-resources.jsonl"), { flags: "a" });
  const eventWriter = createJsonLineWriter(events);
  const random = createSeededRandom(config.random_seed ^ 0xa5a5a5a5);
  const latencies = [];
  const counters = {
    planned: totalMessages,
    attempted: 0,
    accepted: 0,
    failed: 0,
    readings_generated: 0,
    readings_gateway_accepted: 0,
    unique_devices: new Set(),
    unique_households: new Set()
  };
  const inFlight = new Set();
  const startedAt = new Date();
  const startedPerformance = performance.now();
  let cursor = 0;
  let tokenBalance = 0;
  let lastTokenTime = performance.now();
  let lastResourceSample = 0;
  let stopping = false;

  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  async function dispatch(messageIndex) {
    const device = devices[messageIndex % devices.length];
    const cycle = Math.floor(messageIndex / devices.length);
    const jitterMs = Math.floor(random() * Math.min(1000, config.reporting_interval_seconds * 100));
    const timestamp = new Date(Date.now() + jitterMs).toISOString();
    const envelope = createTelemetryEnvelope(device, cycle, config, timestamp);
    const readingCount = Object.keys(envelope.payload.readings).length;
    counters.attempted += 1;
    counters.readings_generated += readingCount;
    counters.unique_devices.add(envelope.payload.device_id);
    counters.unique_households.add(envelope.payload.household_id);
    const started = performance.now();

    try {
      const result = await sendTelemetry(envelope, config, options.fetchImpl);
      const elapsedMs = result.elapsedMs || performance.now() - started;
      latencies.push(elapsedMs);
      const accepted = result.statusCode >= 200 && result.statusCode < 300;
      counters[accepted ? "accepted" : "failed"] += 1;
      if (accepted) counters.readings_gateway_accepted += readingCount;
      await eventWriter.write({
        type: accepted ? "gateway_accepted" : "gateway_rejected",
        recorded_at: new Date().toISOString(),
        message_id: envelope.messageId,
        correlation_id: envelope.correlationId,
        household_id: envelope.payload.household_id,
        device_id: envelope.payload.device_id,
        device_type: envelope.payload.device_type,
        reading_ids: envelope.readingIds,
        source_timestamp: envelope.payload.timestamp,
        gateway_status_code: result.statusCode,
        gateway_latency_ms: Number(elapsedMs.toFixed(3)),
        response_status: result.body?.status || result.body?.error || null
      });
    } catch (error) {
      counters.failed += 1;
      await eventWriter.write({
        type: "gateway_error",
        recorded_at: new Date().toISOString(),
        message_id: envelope.messageId,
        correlation_id: envelope.correlationId,
        household_id: envelope.payload.household_id,
        device_id: envelope.payload.device_id,
        device_type: envelope.payload.device_type,
        reading_ids: envelope.readingIds,
        error: error.message
      });
    }
  }

  while (cursor < totalMessages && !stopping) {
    const now = performance.now();
    const elapsedSeconds = (now - startedPerformance) / 1000;
    const elapsedSinceTokens = (now - lastTokenTime) / 1000;
    tokenBalance = Math.min(
      config.gateway.concurrency * 2,
      tokenBalance + currentRate(config, elapsedSeconds, random) * elapsedSinceTokens
    );
    lastTokenTime = now;

    while (
      cursor < totalMessages &&
      tokenBalance >= 1 &&
      inFlight.size < config.gateway.concurrency
    ) {
      tokenBalance -= 1;
      const task = dispatch(cursor).finally(() => inFlight.delete(task));
      inFlight.add(task);
      cursor += 1;
    }

    if (now - lastResourceSample >= config.evidence.resource_sample_interval_ms) {
      lastResourceSample = now;
      const memory = process.memoryUsage();
      await writeJsonLine(resources, {
        recorded_at: new Date().toISOString(),
        generated: cursor,
        in_flight: inFlight.size,
        rss_bytes: memory.rss,
        heap_used_bytes: memory.heapUsed,
        external_bytes: memory.external
      });
    }

    if (inFlight.size >= config.gateway.concurrency || tokenBalance < 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await Promise.allSettled(inFlight);
  await eventWriter.flush();
  events.end();
  resources.end();
  await Promise.all([once(events, "finish"), once(resources, "finish")]);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);

  const completedAt = new Date();
  const elapsedSeconds = (performance.now() - startedPerformance) / 1000;
  const summary = {
    scenario_id: config.scenario_id,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    elapsed_seconds: Number(elapsedSeconds.toFixed(3)),
    mode: config.mode,
    dry_run: config.dry_run,
    configured_devices: config.device_count,
    represented_devices: counters.unique_devices.size,
    represented_households: counters.unique_households.size,
    telemetry_planned: counters.planned,
    telemetry_attempted: counters.attempted,
    telemetry_gateway_accepted: counters.accepted,
    telemetry_gateway_failed: counters.failed,
    readings_generated: counters.readings_generated,
    readings_gateway_accepted: counters.readings_gateway_accepted,
    readings_gateway_failed: counters.readings_generated - counters.readings_gateway_accepted,
    gateway_acceptance_rate_percent: counters.attempted
      ? Number(((counters.accepted / counters.attempted) * 100).toFixed(4))
      : 0,
    generated_messages_per_second: Number((counters.attempted / Math.max(elapsedSeconds, 0.001)).toFixed(3)),
    gateway_latency: summarizeLatencies(latencies),
    bounded_concurrency: config.gateway.concurrency,
    output_directory: runDirectory,
    end_to_end_validated: false,
    note: "Gateway acceptance is not end-to-end success. Pipeline completion is evaluated separately."
  };
  fs.writeFileSync(path.join(runDirectory, "generator-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    path.join(runDirectory, "generator-summary.csv"),
    `${Object.keys(summary).join(",")}\n${Object.values(summary).map((value) => JSON.stringify(value)).join(",")}\n`
  );
  return summary;
}

async function main() {
  const args = parseArguments();
  const configPath = path.resolve(args.config || DEFAULT_CONFIG_PATH);
  const baseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const config = resolveConfig(baseConfig, args);
  const summary = await runScaleGenerator(config);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.telemetry_gateway_failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  allocateDeviceTypes,
  createMessageIdentity,
  createJsonLineWriter,
  createReadingIds,
  createSeededRandom,
  createTelemetryEnvelope,
  createVirtualDevices,
  normalizeDistribution,
  parseArguments,
  resolveConfig,
  runScaleGenerator,
  sendTelemetry,
  stableHash
};
