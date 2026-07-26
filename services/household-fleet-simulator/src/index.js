"use strict";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { buildFleet, seededRandom } = require("./fleet");
const { createPool, registerFleet } = require("./db");

function loadConfig(env = process.env) {
  const configPath = env.FLEET_CONFIG_PATH;
  let fileConfig = {};
  if (configPath) {
    fileConfig = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
  }
  return {
    householdCount: Number(env.FLEET_HOUSEHOLD_COUNT || fileConfig.household_count || 20),
    seed: Number(env.FLEET_RANDOM_SEED || fileConfig.random_seed || 20260724),
    reportingIntervalMs: Number(
      env.FLEET_REPORTING_INTERVAL_MS || fileConfig.reporting_interval_ms || 180000
    ),
    schedulerTickMs: Number(env.FLEET_SCHEDULER_TICK_MS || 250),
    maxInFlight: Number(env.FLEET_MAX_IN_FLIGHT || 8),
    autostart: String(env.FLEET_AUTOSTART || "true").toLowerCase() === "true",
    gatewayUrl: env.SECURITY_GATEWAY_URL || "http://security-gateway:3010",
    edgeApiKey: env.EDGE_API_KEY || "",
    port: Number(env.HOUSEHOLD_FLEET_SIMULATOR_PORT || 3012),
    communityId: env.FLEET_COMMUNITY_ID || fileConfig.community_id,
    householdPrefix: env.FLEET_HOUSEHOLD_PREFIX || fileConfig.household_prefix,
    areaPrefix: env.FLEET_AREA_PREFIX || fileConfig.area_prefix,
    profileMix: fileConfig.profile_mix || {
      apartment: 6,
      standard_home: 8,
      prosumer_home: 6
    }
  };
}

function createRuntime(config, fleet, dependencies = {}) {
  const send = dependencies.sendTelemetry || (async (telemetry) => {
    const response = await fetch(`${config.gatewayUrl.replace(/\/$/, "")}/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-api-key": config.edgeApiKey,
        "x-correlation-id": `fleet-${crypto.randomUUID()}`
      },
      body: JSON.stringify(telemetry),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const message = await response.text();
      const error = new Error(`Gateway returned ${response.status}: ${message.slice(0, 200)}`);
      error.statusCode = response.status;
      error.retryAfterMs = Math.max(
        1000,
        Number(response.headers.get("retry-after") || 0) * 1000
      );
      throw error;
    }
  });
  const scheduleRandom = seededRandom(config.seed + 77);
  const startedAt = Date.now();
  const queue = fleet.devices.map((entry, index) => ({
    ...entry,
    next_at:
      startedAt +
      Math.floor((index / Math.max(1, fleet.devices.length)) * config.reportingIntervalMs)
  }));
  const stats = {
    started_at: new Date(startedAt).toISOString(),
    telemetry_attempted: 0,
    telemetry_generated: 0,
    telemetry_accepted: 0,
    telemetry_failed: 0,
    telemetry_retried: 0,
    telemetry_dropped: 0,
    in_flight: 0,
    last_emitted_at: null,
    last_error: null
  };
  let timer = null;

  async function emit(item) {
    stats.in_flight += 1;
    stats.telemetry_attempted += 1;
    let nextDelay = Math.round(
      config.reportingIntervalMs * (0.9 + scheduleRandom() * 0.2)
    );
    try {
      if (!item.pending_telemetry) {
        const timestamp = new Date().toISOString();
        item.pending_telemetry = item.device.getTelemetry(timestamp);
        stats.telemetry_generated += 1;
      } else {
        stats.telemetry_retried += 1;
      }
      await send(item.pending_telemetry);
      stats.telemetry_accepted += 1;
      stats.last_emitted_at = item.pending_telemetry.timestamp;
      item.pending_telemetry = null;
    } catch (error) {
      stats.telemetry_failed += 1;
      stats.last_error = error.message;
      nextDelay = error.retryAfterMs ||
        Math.min(30000, Math.max(2000, config.reportingIntervalMs / 12));
    } finally {
      stats.in_flight -= 1;
      item.next_at = Date.now() + nextDelay;
    }
  }

  function step(now = Date.now()) {
    const capacity = Math.max(0, config.maxInFlight - stats.in_flight);
    if (!capacity) return;
    const due = queue
      .filter((item) => item.next_at <= now)
      .sort((left, right) => left.next_at - right.next_at)
      .slice(0, capacity);
    for (const item of due) {
      item.next_at = Number.POSITIVE_INFINITY;
      void emit(item);
    }
  }

  function start() {
    if (!timer) timer = setInterval(step, config.schedulerTickMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stats,
    step,
    stop,
    summary() {
      return {
        ...fleet.summary,
        ...stats,
        scheduler: {
          reporting_interval_ms: config.reportingIntervalMs,
          scheduler_tick_ms: config.schedulerTickMs,
          max_in_flight: config.maxInFlight,
          bounded_processes: 1,
          per_device_threads: 0
        },
        simulated: true,
        no_real_execution: true
      };
    }
  };
}

function createApp(runtime) {
  const app = express();
  app.get("/health", (_request, response) => {
    response.json({
      status: runtime.stats.last_error && runtime.stats.telemetry_accepted === 0
        ? "degraded"
        : "ok",
      service: "household-fleet-simulator",
      ...runtime.summary()
    });
  });
  app.get("/fleet/summary", (_request, response) => response.json(runtime.summary()));
  return app;
}

async function start() {
  const config = loadConfig();
  if (!config.edgeApiKey) throw new Error("EDGE_API_KEY is required.");
  const fleet = buildFleet(config);
  const pool = createPool();
  await registerFleet(pool, fleet.devices.map((entry) => entry.inventory));
  const runtime = createRuntime(config, fleet);
  const app = createApp(runtime);
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(
      `Household fleet simulator listening on ${config.port}: ` +
      `${fleet.summary.household_count} households, ${fleet.summary.device_count} devices.`
    );
  });
  if (config.autostart) runtime.start();

  const shutdown = () => {
    runtime.stop();
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Household fleet simulator failed:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  createRuntime,
  loadConfig,
  start
};
