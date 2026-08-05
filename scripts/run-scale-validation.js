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
const {
  buildFleet,
  stableReportingOffset
} = require("../services/household-fleet-simulator/src/fleet");
const {
  selectPrimaryReading
} = require("../services/household-fleet-simulator/src/primary-reading");

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
  if (config.population_model === "exact_household_profiles") {
    const prefix = config.household_prefix_from_scenario
      ? String(config.scenario_id || "scale-validation")
        .replace(/[^a-zA-Z0-9-]+/g, "-")
        .slice(0, 64)
      : config.household_prefix;
    const fleet = buildFleet({
      householdCount: config.household_count,
      seed: config.random_seed,
      communityId: config.community_id,
      householdPrefix: prefix,
      areaPrefix: config.area_prefix,
      profileMix: config.profile_mix,
      exactProfileInventories: true,
      reportingWindowMs: config.reporting_window_seconds * 1000,
      reportingIntervalMs: config.reporting_interval_seconds * 1000,
      timeZone: config.time_zone,
      referenceTimestamp: config.population_reference_time
    });
    if (fleet.summary.device_count !== Number(config.device_count)) {
      throw new Error(
        `Exact population created ${fleet.summary.device_count} assets; expected ${config.device_count}.`
      );
    }
    const households = new Map(
      fleet.households.map((household) => [household.household_id, household])
    );
    return fleet.devices.map((entry) => {
      entry.device.scaleInventory = entry.inventory;
      entry.device.scaleHousehold = households.get(entry.inventory.household_id);
      entry.device.reportingOffsetMs = entry.inventory.reporting_offset_ms;
      return entry.device;
    });
  }

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
  const selected = config.primary_reading_mode
    ? selectPrimaryReading(telemetry, cycle)
    : { field: null, readings: telemetry.readings };
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
    readings: selected.readings
  });
  const inventory = device.scaleInventory || {};
  const household = device.scaleHousehold || {};
  const energyEntry = Object.entries(telemetry.readings).find(([field]) =>
    /(energy|throughput).*kwh/i.test(field)
  );
  const primaryReading = selected.field ? selected.readings[selected.field] : null;

  return {
    messageId: identity.messageId,
    correlationId: identity.correlationId,
    readingIds,
    payload: {
      message_id: identity.messageId,
      correlation_id: identity.correlationId,
      reading_ids: readingIds,
      household_id: telemetry.household_id,
      community_id: telemetry.community_id,
      device_id: telemetry.device_id,
      device_type: telemetry.device_type,
      timestamp: telemetry.timestamp,
      readings: selected.readings,
      protocol: "http",
      source: `scale-${telemetry.device_type}-simulator`,
      metadata: {
        area_id: telemetry.area_id || inventory.area_id || null,
        household_profile: inventory.household_profile || null,
        device_category: inventory.device_category || telemetry.device_type,
        time_zone: household.time_zone || config.time_zone || null,
        occupancy_pattern: household.occupancy_pattern || null,
        base_load_profile: household.base_load_profile || null,
        display_name: inventory.display_name || telemetry.device_type,
        manufacturer: inventory.manufacturer || telemetry.provider || "simulated",
        online: inventory.online !== false,
        operating_state:
          telemetry.operating_state ||
          telemetry.relay_state ||
          telemetry.charging_state ||
          inventory.current_operating_state ||
          "available",
        flexibility_capable: Boolean(inventory.flexibility_capable),
        maximum_flexible_power_kw: Number(inventory.maximum_flexible_power_kw || 0),
        measurement_capabilities:
          inventory.measurement_capabilities || Object.keys(telemetry.readings),
        selected_primary_field: selected.field,
        current_primary_measurement: selected.field ? {
          field: selected.field,
          value: Number(primaryReading?.value ?? primaryReading),
          unit: primaryReading?.unit || null
        } : null,
        cumulative_energy_kwh: energyEntry
          ? Number(energyEntry[1]?.value ?? energyEntry[1])
          : null,
        reporting_offset_ms: Number(
          device.reportingOffsetMs ??
          stableReportingOffset(telemetry.device_id, config.reporting_window_seconds * 1000)
        ),
        simulated: true,
        no_real_execution: true
      }
    }
  };
}

function resolveConfig(baseConfig, overrides = {}) {
  const deviceCount = Math.floor(positiveNumber(overrides.devices, baseConfig.device_count));
  const stagePopulation = baseConfig.stage_populations?.[String(deviceCount)] || null;
  if (baseConfig.population_model === "exact_household_profiles" && !stagePopulation) {
    throw new Error(
      `No exact household population is configured for ${deviceCount} assets.`
    );
  }
  const intervalSeconds = positiveNumber(
    overrides.intervalSeconds,
    baseConfig.reporting_interval_seconds
  );
  const durationMinutes = positiveNumber(overrides.durationMinutes, baseConfig.test_duration_minutes);
  const configuredCycles = overrides.cycles === undefined
    ? Math.max(1, Math.floor((durationMinutes * 60) / intervalSeconds))
    : Math.floor(positiveNumber(overrides.cycles, baseConfig.cycles));
  const derivedRate = deviceCount / intervalSeconds;

  return {
    ...baseConfig,
    device_count: deviceCount,
    household_count: Math.floor(positiveNumber(
      overrides.households,
      stagePopulation?.household_count || baseConfig.household_count
    )),
    profile_mix: stagePopulation?.profile_mix || baseConfig.profile_mix,
    reporting_interval_seconds: intervalSeconds,
    reporting_window_seconds: positiveNumber(
      overrides.reportingWindowSeconds,
      baseConfig.reporting_window_seconds || intervalSeconds
    ),
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
    primary_reading_mode: overrides.primaryReadingMode === undefined
      ? baseConfig.primary_reading_mode === true
      : String(overrides.primaryReadingMode).toLowerCase() === "true",
    burst_asset_count: Math.floor(nonNegativeNumber(
      overrides.burstAssets,
      baseConfig.burst_asset_count || 0
    )),
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const maximumAttempts = Math.max(1, Number(config.gateway.max_retries || 0) + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
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
      const retriableStatus =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;
      if (!retriableStatus || attempt === maximumAttempts) {
        return {
          statusCode: response.status,
          elapsedMs: performance.now() - started,
          attempts: attempt,
          body
        };
      }
      lastError = new Error(`Gateway returned retriable HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt === maximumAttempts) break;
    }

    await wait(Number(config.gateway.retry_backoff_ms || 250) * attempt);
  }

  const detail =
    lastError?.cause?.code ||
    lastError?.cause?.message ||
    lastError?.message ||
    "unknown transport failure";
  const exhausted = new Error(
    `Gateway request failed after ${maximumAttempts} attempt(s): ${detail}`
  );
  exhausted.cause = lastError;
  throw exhausted;
}

function createLatencyAccumulator() {
  return {
    count: 0,
    sum: 0,
    minimum: Number.POSITIVE_INFINITY,
    maximum: Number.NEGATIVE_INFINITY
  };
}

function recordLatency(accumulator, value) {
  accumulator.count += 1;
  accumulator.sum += value;
  accumulator.minimum = Math.min(accumulator.minimum, value);
  accumulator.maximum = Math.max(accumulator.maximum, value);
}

function summarizeLatencies(accumulator) {
  if (!accumulator.count) {
    return { minimum_ms: null, average_ms: null, maximum_ms: null };
  }
  return {
    minimum_ms: accumulator.minimum,
    average_ms: accumulator.sum / accumulator.count,
    maximum_ms: accumulator.maximum
  };
}

async function runScaleGenerator(config, options = {}) {
  const unsortedDevices = options.devices || createVirtualDevices(config);
  const devices = config.mode === "staggered" || config.mode === "burst"
    ? [...unsortedDevices].sort((left, right) =>
      Number(left.reportingOffsetMs || 0) - Number(right.reportingOffsetMs || 0) ||
      String(left.deviceId).localeCompare(String(right.deviceId))
    )
    : unsortedDevices;
  const totalAvailable = devices.length * config.cycles;
  const totalMessages = Math.min(totalAvailable, config.max_messages || totalAvailable);
  const runDirectory = options.runDirectory || createRunDirectory(
    config.evidence.output_location,
    config.scenario_id
  );
  fs.writeFileSync(path.join(runDirectory, "resolved-config.json"), `${JSON.stringify(config, null, 2)}\n`);
  const population = {
    households: new Set(devices.map((device) => device.householdId)).size,
    assets: devices.length,
    profiles: {},
    categories: {},
    simulated: true,
    no_real_execution: true
  };
  const inventoryStream = fs.createWriteStream(
    path.join(runDirectory, "device-inventory.jsonl"),
    { flags: "a" }
  );
  for (const device of devices) {
    const inventory = device.scaleInventory || {
      device_id: device.deviceId,
      household_id: device.householdId,
      device_category: device.deviceType,
      simulated: true,
      no_real_execution: true
    };
    const profile = inventory.household_profile || "unclassified";
    const category = inventory.device_category || device.deviceType;
    population.profiles[profile] = (population.profiles[profile] || 0) + 1;
    population.categories[category] = (population.categories[category] || 0) + 1;
    inventoryStream.write(`${JSON.stringify(inventory)}\n`);
  }
  inventoryStream.end();
  await once(inventoryStream, "finish");
  fs.writeFileSync(
    path.join(runDirectory, "population-summary.json"),
    `${JSON.stringify(population, null, 2)}\n`
  );
  const events = fs.createWriteStream(path.join(runDirectory, "generator-events.jsonl"), { flags: "a" });
  const resources = fs.createWriteStream(path.join(runDirectory, "generator-resources.jsonl"), { flags: "a" });
  const eventWriter = createJsonLineWriter(events);
  const random = createSeededRandom(config.random_seed ^ 0xa5a5a5a5);
  const latencyAccumulator = createLatencyAccumulator();
  const counters = {
    planned: totalMessages,
    attempted: 0,
    accepted: 0,
    failed: 0,
    readings_generated: 0,
    readings_gateway_accepted: 0,
    gateway_retries: 0,
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
  let lastCpuSampleAt = performance.now();
  let lastCpuUsage = process.cpuUsage();
  let stopping = false;

  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  async function dispatch(messageIndex) {
    const device = devices[messageIndex % devices.length];
    const cycle = Math.floor(messageIndex / devices.length);
    const timestamp = new Date().toISOString();
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
      recordLatency(latencyAccumulator, elapsedMs);
      const accepted = result.statusCode >= 200 && result.statusCode < 300;
      counters.gateway_retries += Math.max(0, Number(result.attempts || 1) - 1);
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
        household_profile: envelope.payload.metadata?.household_profile || null,
        selected_primary_field: envelope.payload.metadata?.selected_primary_field || null,
        reading_ids: envelope.readingIds,
        source_timestamp: envelope.payload.timestamp,
        gateway_status_code: result.statusCode,
        gateway_latency_ms: Number(elapsedMs.toFixed(3)),
        gateway_attempts: Number(result.attempts || 1),
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

    while (cursor < totalMessages && inFlight.size < config.gateway.concurrency) {
      const deviceIndex = cursor % devices.length;
      const cycle = Math.floor(cursor / devices.length);
      const reportingWindowMs = config.reporting_window_seconds * 1000;
      const burstCount = config.mode === "burst" ? config.burst_asset_count : 0;
      const inInitialBurst = cycle === 0 && deviceIndex < burstCount;
      if (!inInitialBurst && tokenBalance < 1) break;
      const scheduledOffsetMs =
        cycle * config.reporting_interval_seconds * 1000 +
        (inInitialBurst ? 0 : Number(devices[deviceIndex].reportingOffsetMs || 0) % reportingWindowMs);
      if (
        (config.mode === "staggered" || config.mode === "burst") &&
        now - startedPerformance < scheduledOffsetMs
      ) {
        break;
      }
      if (!inInitialBurst) tokenBalance -= 1;
      const task = dispatch(cursor).finally(() => inFlight.delete(task));
      inFlight.add(task);
      cursor += 1;
    }

    if (now - lastResourceSample >= config.evidence.resource_sample_interval_ms) {
      lastResourceSample = now;
      const memory = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const cpuElapsedMs = Math.max(now - lastCpuSampleAt, 1);
      const cpuUsedMicroseconds =
        cpuUsage.user - lastCpuUsage.user +
        cpuUsage.system - lastCpuUsage.system;
      await writeJsonLine(resources, {
        recorded_at: new Date().toISOString(),
        generated: cursor,
        in_flight: inFlight.size,
        cpu_percent: Number(
          ((cpuUsedMicroseconds / (cpuElapsedMs * 1000)) * 100).toFixed(3)
        ),
        cpu_user_microseconds: cpuUsage.user,
        cpu_system_microseconds: cpuUsage.system,
        rss_bytes: memory.rss,
        heap_used_bytes: memory.heapUsed,
        external_bytes: memory.external
      });
      lastCpuSampleAt = now;
      lastCpuUsage = cpuUsage;
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
    gateway_retry_count: counters.gateway_retries,
    gateway_acceptance_rate_percent: counters.attempted
      ? Number(((counters.accepted / counters.attempted) * 100).toFixed(4))
      : 0,
    generated_messages_per_second: Number((counters.attempted / Math.max(elapsedSeconds, 0.001)).toFixed(3)),
    gateway_latency: summarizeLatencies(latencyAccumulator),
    bounded_concurrency: config.gateway.concurrency,
    primary_reading_mode: config.primary_reading_mode,
    reporting_window_seconds: config.reporting_window_seconds,
    population,
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
