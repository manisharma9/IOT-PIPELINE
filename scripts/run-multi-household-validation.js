"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  createEnodeEaseeDevice,
  createHeatPumpDevice,
  createShellyPlugDevice
} = require("../services/common/simulators");

const repoRoot = path.resolve(__dirname, "..");

function parseArguments(argv = process.argv.slice(2)) {
  const values = {
    households: 5,
    cycles: 1,
    minIntervalMs: 300,
    maxIntervalMs: 1400,
    timeoutSeconds: 2400,
    gatewayUrl: process.env.GATEWAY_BASE_URL || "http://localhost:3010",
    edgeApiKey: process.env.EDGE_API_KEY || "local-dev-edge-key",
    ollamaUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.SLM_MODEL || process.env.OLLAMA_MODEL || "phi3:mini",
    output: path.join(repoRoot, "docs", "demo-assets", "multi-household-validation-results.json")
  };

  const aliases = {
    "--households": "households",
    "--cycles": "cycles",
    "--min-interval-ms": "minIntervalMs",
    "--max-interval-ms": "maxIntervalMs",
    "--timeout-seconds": "timeoutSeconds",
    "--gateway-url": "gatewayUrl",
    "--edge-api-key": "edgeApiKey",
    "--ollama-url": "ollamaUrl",
    "--model": "model",
    "--output": "output"
  };

  for (let index = 0; index < argv.length; index += 2) {
    const key = aliases[argv[index]];
    if (!key || argv[index + 1] === undefined) {
      throw new Error(`Unknown or incomplete argument: ${argv[index] || "<empty>"}`);
    }
    values[key] = argv[index + 1];
  }

  for (const field of ["households", "cycles", "minIntervalMs", "maxIntervalMs", "timeoutSeconds"]) {
    values[field] = Number(values[field]);
    if (!Number.isInteger(values[field]) || values[field] <= 0) {
      throw new Error(`${field} must be a positive integer.`);
    }
  }

  if (values.maxIntervalMs < values.minIntervalMs) {
    throw new Error("maxIntervalMs must be greater than or equal to minIntervalMs.");
  }

  values.output = path.resolve(repoRoot, values.output);
  return values;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function randomInteger(random, minimum, maximum) {
  return Math.floor(minimum + random() * (maximum - minimum + 1));
}

function buildHouseholds({ householdCount, runPrefix, minIntervalMs, maxIntervalMs }) {
  const households = [];

  for (let index = 1; index <= householdCount; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const householdId = `${runPrefix}-household-${suffix}`;
    const common = {
      householdId,
      communityId: "community-dublin-north",
      areaId: index <= 3 ? "dublin-north-a" : "dublin-north-b"
    };

    const shellyRandom = seededRandom(1000 + index);
    const enodeRandom = seededRandom(2000 + index);
    const heatPumpRandom = seededRandom(3000 + index);
    const shellyIntervalRandom = seededRandom(110000 + index * 104729);
    const enodeIntervalRandom = seededRandom(220000 + index * 130363);
    const heatPumpIntervalRandom = seededRandom(330000 + index * 155921);

    households.push({
      household_id: householdId,
      devices: [
        {
          type: "shelly_plug",
          interval_ms: randomInteger(shellyIntervalRandom, minIntervalMs, maxIntervalMs),
          device: createShellyPlugDevice({
            ...common,
            deviceId: `${runPrefix}-shelly-${suffix}`,
            controllableLoadKw: 1.05 + index * 0.17,
            initialEnergyKwh: 84 + index * 13.7,
            random: shellyRandom
          })
        },
        {
          type: "ev_charger",
          interval_ms: randomInteger(enodeIntervalRandom, minIntervalMs, maxIntervalMs),
          device: createEnodeEaseeDevice({
            ...common,
            deviceId: `${runPrefix}-easee-${suffix}`,
            controllableLoadKw: 6.5 + index * 0.18,
            initialEnergyKwh: 10 + index * 4.25,
            random: enodeRandom
          })
        },
        {
          type: "heat_pump",
          interval_ms: randomInteger(heatPumpIntervalRandom, minIntervalMs, maxIntervalMs),
          device: createHeatPumpDevice({
            ...common,
            deviceId: `${runPrefix}-heat-pump-${suffix}`,
            controllableLoadKw: 2.5 + index * 0.22,
            initialIndoorTemperatureC: 19.1 + index * 0.32,
            targetTemperatureC: 20.4 + index * 0.28,
            random: heatPumpRandom
          })
        }
      ]
    });
  }

  return households;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function summarizeNumbers(values) {
  if (!values.length) {
    return { minimum: 0, average: 0, maximum: 0, p95: 0 };
  }

  return {
    minimum: Number(Math.min(...values).toFixed(2)),
    average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    maximum: Number(Math.max(...values).toFixed(2)),
    p95: Number(percentile(values, 95).toFixed(2))
  };
}

async function fetchJson(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 30000)
  });
  const body = await response.json().catch(() => ({}));
  const elapsedMs = performance.now() - started;

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return { response, body, elapsedMs };
}

function psqlJson(sql) {
  const output = execFileSync(
    "docker",
    [
      "exec",
      "adflex-timescaledb",
      "psql",
      "-U",
      "energy_user",
      "-d",
      "energy_flex",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql
    ],
    { encoding: "utf8", windowsHide: true }
  ).trim();

  if (!output) return null;
  return JSON.parse(output.split(/\r?\n/).filter(Boolean).at(-1));
}

function safeSql(value) {
  return String(value).replace(/'/g, "''");
}

function queryRunMetrics(devicePrefix) {
  const prefix = safeSql(`${devicePrefix}%`);
  return psqlJson(`
    WITH
    raw AS (
      SELECT * FROM raw_telemetry WHERE device_id LIKE '${prefix}'
    ),
    normalized AS (
      SELECT * FROM normalized_telemetry WHERE device_id LIKE '${prefix}'
    ),
    semantic AS (
      SELECT * FROM semantic_events WHERE device_id LIKE '${prefix}'
    ),
    ieee AS (
      SELECT * FROM ieee20305_events WHERE device_id LIKE '${prefix}'
    ),
    semantic_latency AS (
      SELECT EXTRACT(EPOCH FROM (s.processed_at - n.processed_at)) * 1000 AS milliseconds
      FROM semantic s
      JOIN normalized n USING (event_time, device_id, reading_name)
    ),
    pipeline_latency AS (
      SELECT EXTRACT(EPOCH FROM (i.processed_at - r.received_at)) * 1000 AS milliseconds
      FROM ieee i
      JOIN raw r USING (event_time, device_id)
    ),
    raw_insert_latency AS (
      SELECT EXTRACT(EPOCH FROM (received_at - event_time)) * 1000 AS milliseconds FROM raw
    )
    SELECT json_build_object(
      'raw_telemetry', (SELECT count(*) FROM raw),
      'normalized_telemetry', (SELECT count(*) FROM normalized),
      'semantic_events', (SELECT count(*) FROM semantic),
      'ieee20305_events', (SELECT count(*) FROM ieee),
      'semantic_unique_readings', (SELECT count(DISTINCT (event_time, device_id, reading_name)) FROM semantic),
      'ieee20305_unique_readings', (SELECT count(DISTINCT (event_time, device_id, reading_name)) FROM ieee),
      'semantic_duplicate_rows', (
        SELECT count(*) - count(DISTINCT (event_time, device_id, reading_name)) FROM semantic
      ),
      'ieee20305_duplicate_rows', (
        SELECT count(*) - count(DISTINCT (event_time, device_id, reading_name)) FROM ieee
      ),
      'unique_households', (SELECT count(DISTINCT household_id) FROM raw),
      'unique_devices', (SELECT count(DISTINCT device_id) FROM raw),
      'slm_calls', (SELECT count(*) FROM semantic WHERE semantic_payload->'slm_audit'->>'slm_called' = 'true'),
      'slm_primary', (SELECT count(*) FROM semantic WHERE mapping_source = 'slm_primary'),
      'deterministic_fallback', (SELECT count(*) FROM semantic WHERE mapping_source = 'deterministic_fallback'),
      'unmapped', (SELECT count(*) FROM semantic WHERE mapping_source = 'unmapped'),
      'processing_errors', (
        SELECT count(*) FROM processing_errors
        WHERE payload->>'device_id' LIKE '${prefix}'
      ),
      'raw_insert_latency_ms', json_build_object(
        'minimum', COALESCE((SELECT round(min(milliseconds)::numeric, 2) FROM raw_insert_latency), 0),
        'average', COALESCE((SELECT round(avg(milliseconds)::numeric, 2) FROM raw_insert_latency), 0),
        'maximum', COALESCE((SELECT round(max(milliseconds)::numeric, 2) FROM raw_insert_latency), 0)
      ),
      'semantic_processing_ms', json_build_object(
        'minimum', COALESCE((SELECT round(min(milliseconds)::numeric, 2) FROM semantic_latency), 0),
        'average', COALESCE((SELECT round(avg(milliseconds)::numeric, 2) FROM semantic_latency), 0),
        'maximum', COALESCE((SELECT round(max(milliseconds)::numeric, 2) FROM semantic_latency), 0)
      ),
      'pipeline_latency_ms', json_build_object(
        'minimum', COALESCE((SELECT round(min(milliseconds)::numeric, 2) FROM pipeline_latency), 0),
        'average', COALESCE((SELECT round(avg(milliseconds)::numeric, 2) FROM pipeline_latency), 0),
        'maximum', COALESCE((SELECT round(max(milliseconds)::numeric, 2) FROM pipeline_latency), 0)
      ),
      'first_received_at', (SELECT min(received_at) FROM raw),
      'last_ieee_processed_at', (SELECT max(processed_at) FROM ieee),
      'fallback_reasons', COALESCE((
        SELECT json_agg(row_to_json(reason_rows))
        FROM (
          SELECT COALESCE(semantic_payload->'slm_audit'->>'fallback_reason', 'none') AS reason, count(*) AS count
          FROM semantic
          GROUP BY 1
          ORDER BY 2 DESC
        ) reason_rows
      ), '[]'::json),
      'per_device', COALESCE((
        SELECT json_agg(row_to_json(device_rows))
        FROM (
          SELECT
            r.household_id,
            r.device_id,
            r.device_type,
            count(DISTINCT r.id) AS telemetry_messages,
            (SELECT count(*) FROM normalized n WHERE n.device_id = r.device_id) AS normalized_readings,
            (SELECT count(*) FROM semantic s WHERE s.device_id = r.device_id) AS semantic_readings,
            (SELECT count(*) FROM ieee i WHERE i.device_id = r.device_id) AS ieee_readings
          FROM raw r
          GROUP BY r.household_id, r.device_id, r.device_type
          ORDER BY r.household_id, r.device_type
        ) device_rows
      ), '[]'::json)
    )::text;
  `);
}

function queryCommandEvidence(proposalId, signalId) {
  const id = Number(proposalId);
  const safeSignalId = safeSql(signalId);
  return psqlJson(`
    SELECT json_build_object(
      'proposal_status', (SELECT status FROM dispatch_commands WHERE id = ${id} ORDER BY created_at DESC LIMIT 1),
      'approval_audit_rows', (SELECT count(*) FROM dispatch_approval_audit WHERE dispatch_command_id = ${id}),
      'mock_dispatch_rows', (SELECT count(*) FROM dispatch_execution_audit WHERE dispatch_command_id = ${id}),
      'device_command_rows', (SELECT count(*) FROM device_command_audit WHERE correlation_id = '${safeSignalId}'),
      'no_real_execution', COALESCE((SELECT bool_and(no_real_execution) FROM dispatch_execution_audit WHERE dispatch_command_id = ${id}), true),
      'device_no_real_execution', COALESCE((SELECT bool_and(no_real_execution) FROM device_command_audit WHERE correlation_id = '${safeSignalId}'), true)
    )::text;
  `);
}

function collectContainerResources() {
  const output = execFileSync(
    "docker",
    ["stats", "--no-stream", "--format", "{{json .}}"],
    { encoding: "utf8", windowsHide: true }
  );

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => String(row.Name || "").startsWith("adflex-"))
    .map((row) => ({
      container: row.Name,
      cpu_percent: row.CPUPerc,
      memory_usage: row.MemUsage,
      memory_percent: row.MemPerc,
      network_io: row.NetIO,
      block_io: row.BlockIO,
      processes: row.PIDs
    }));
}

async function checkDependencies(config) {
  const gateway = await fetchJson(`${config.gatewayUrl}/health`);
  if (gateway.body.status !== "ok") {
    throw new Error("Security gateway is not healthy.");
  }

  const tags = await fetchJson(`${config.ollamaUrl.replace(/\/$/, "")}/api/tags`);
  const models = Array.isArray(tags.body.models)
    ? tags.body.models.map((model) => model.name || model.model)
    : [];
  if (!models.includes(config.model)) {
    throw new Error(`Ollama is reachable, but ${config.model} is not installed.`);
  }

  psqlJson("SELECT json_build_object('status', 'ok')::text;");
  return {
    gateway_status: gateway.body.status,
    ollama_status: "ok",
    model: config.model,
    installed_models: models
  };
}

async function sendTelemetry({ config, households, cycles, runId, source }) {
  const devices = households.flatMap((household) => household.devices);
  const results = [];
  const startedAt = new Date();

  const tasks = devices.map(async (entry, deviceIndex) => {
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      const delay = entry.interval_ms * cycle;
      await sleep(delay);
      const timestamp = new Date().toISOString();
      const telemetry = entry.device.getTelemetry(timestamp);
      telemetry.source = source;
      const correlationId = `${runId}-${String(deviceIndex + 1).padStart(2, "0")}-${cycle}`;

      try {
        const { response, body, elapsedMs } = await fetchJson(`${config.gatewayUrl}/telemetry`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-edge-api-key": config.edgeApiKey,
            "x-correlation-id": correlationId
          },
          body: JSON.stringify(telemetry)
        });
        results.push({
          household_id: telemetry.householdId,
          device_id: telemetry.deviceId,
          device_type: telemetry.deviceType,
          cycle,
          interval_ms: entry.interval_ms,
          reading_count: Object.keys(telemetry.data).length,
          timestamp,
          status_code: response.status,
          accepted: body.status === "accepted",
          gateway_response_ms: Number(elapsedMs.toFixed(2)),
          correlation_id: correlationId,
          sample: telemetry.data
        });
      } catch (error) {
        results.push({
          household_id: telemetry.householdId,
          device_id: telemetry.deviceId,
          device_type: telemetry.deviceType,
          cycle,
          interval_ms: entry.interval_ms,
          reading_count: Object.keys(telemetry.data).length,
          timestamp,
          status_code: 0,
          accepted: false,
          gateway_response_ms: 0,
          correlation_id: correlationId,
          error: error.message,
          sample: telemetry.data
        });
      }
    }
  });

  await Promise.all(tasks);
  const completedAt = new Date();
  results.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  return {
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_seconds: Number(((completedAt - startedAt) / 1000).toFixed(2)),
    messages: results,
    gateway_latency_ms: summarizeNumbers(results.filter((row) => row.accepted).map((row) => row.gateway_response_ms))
  };
}

async function waitForPipeline({ devicePrefix, expectedReadings, timeoutSeconds }) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let metrics = queryRunMetrics(devicePrefix);

  while (Date.now() < deadline) {
    console.log(
      `[pipeline] raw=${metrics.raw_telemetry} normalized=${metrics.normalized_telemetry} semantic=${metrics.semantic_events} ieee=${metrics.ieee20305_events}/${expectedReadings}`
    );
    if (
      Number(metrics.raw_telemetry) > 0 &&
      Number(metrics.semantic_unique_readings) >= expectedReadings &&
      Number(metrics.ieee20305_unique_readings) >= expectedReadings
    ) {
      return metrics;
    }
    await sleep(10000);
    metrics = queryRunMetrics(devicePrefix);
  }

  throw new Error(
    `Pipeline did not reach ${expectedReadings} semantic and IEEE rows within ${timeoutSeconds} seconds. Last metrics: ${JSON.stringify(metrics)}`
  );
}

async function runLoadManagement(config, runId) {
  const headers = {
    "content-type": "application/json",
    "x-edge-api-key": config.edgeApiKey,
    "x-correlation-id": `${runId}-dso`
  };
  const signalId = `${runId}-signal`;
  const now = Date.now();
  const signal = {
    signal_id: signalId,
    dso_id: "dso-dublin",
    community_id: "community-dublin-north",
    signal_type: "curtailment_request",
    severity: "medium",
    requested_action: "reduce_load",
    start_time: new Date(now + 5 * 60 * 1000).toISOString(),
    end_time: new Date(now + 35 * 60 * 1000).toISOString(),
    reason: "Multi-household validation of community flexibility workflow"
  };

  const dso = await fetchJson(`${config.gatewayUrl}/dso/grid-signal`, {
    method: "POST",
    headers,
    body: JSON.stringify(signal)
  });

  let proposal = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const proposals = await fetchJson(`${config.gatewayUrl}/dispatch/proposals?limit=50`, {
      headers: { "x-edge-api-key": config.edgeApiKey }
    });
    proposal = (proposals.body.proposals || []).find((row) => row.signal_id === signalId);
    if (proposal) break;
    await sleep(2000);
  }
  if (!proposal) throw new Error(`No dispatch proposal was created for ${signalId}.`);

  const actionBody = {
    reviewer_id: "validation-operator",
    reviewer_role: "system-operator",
    comment: "Multi-household validation. Safe preparation only; no real device execution."
  };
  const actions = [];
  for (const action of ["review", "approve", "mark-ready"]) {
    const result = await fetchJson(
      `${config.gatewayUrl}/approvals/proposals/${proposal.id}/${action}`,
      {
        method: "POST",
        headers: { ...headers, "x-correlation-id": `${runId}-${action}` },
        body: JSON.stringify(actionBody)
      }
    );
    actions.push({ action, status: result.body.new_status || result.body.status });
  }

  let evidence = queryCommandEvidence(proposal.id, signalId);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (Number(evidence.mock_dispatch_rows) > 0 && Number(evidence.device_command_rows) > 0) break;
    await sleep(2000);
    evidence = queryCommandEvidence(proposal.id, signalId);
  }

  const dataspace = await fetchJson(
    `${config.gatewayUrl}/dataspace/export/full-pipeline-demo-summary?limit=100`,
    { headers: { "x-edge-api-key": config.edgeApiKey, "x-correlation-id": `${runId}-dataspace` } }
  );

  return {
    signal_id: signalId,
    dso_status: dso.body.status,
    proposal_id: String(proposal.id),
    actions,
    command_evidence: evidence,
    dataspace: {
      export_type: dataspace.body.export_type,
      record_count: dataspace.body.record_count,
      minimization_applied: dataspace.body.minimization_applied,
      pseudonymization_applied: dataspace.body.pseudonymization_applied,
      no_raw_private_payloads: dataspace.body.no_raw_private_payloads
    }
  };
}

async function main() {
  const config = parseArguments();
  const runId = `mh-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const runPrefix = runId;
  const source = `multi-household-validation-${runId}`;
  const validationStarted = new Date();

  console.log(`Starting multi-household validation ${runId}`);
  const dependencies = await checkDependencies(config);
  console.log(`Gateway and Ollama ${config.model} are available.`);

  const households = buildHouseholds({
    householdCount: config.households,
    runPrefix,
    minIntervalMs: config.minIntervalMs,
    maxIntervalMs: config.maxIntervalMs
  });
  const devices = households.flatMap((household) => household.devices);
  const readingsPerCycle = devices.reduce(
    (sum, entry) => sum + Object.keys(entry.device.getTelemetry(new Date().toISOString()).data).length,
    0
  );
  const expectedMessages = devices.length * config.cycles;
  const expectedReadings = readingsPerCycle * config.cycles;

  console.log(
    `Configured ${households.length} households, ${devices.length} devices, ${expectedMessages} messages, ${expectedReadings} readings.`
  );
  const resourcesBefore = collectContainerResources();
  const generation = await sendTelemetry({
    config,
    households,
    cycles: config.cycles,
    runId,
    source
  });
  const acceptedMessages = generation.messages.filter((row) => row.accepted).length;
  console.log(`Gateway accepted ${acceptedMessages}/${expectedMessages} telemetry messages.`);

  const pipeline = await waitForPipeline({
    devicePrefix: runPrefix,
    expectedReadings,
    timeoutSeconds: config.timeoutSeconds
  });
  console.log("Telemetry reached semantic and IEEE 2030.5-style storage.");

  const loadManagement = await runLoadManagement(config, runId);
  console.log("DSO, approval, mock dispatch, device translation, and dataspace flow completed.");
  const platformStatus = await fetchJson(`${config.gatewayUrl}/platform/status`, {
    headers: { "x-edge-api-key": config.edgeApiKey }
  });
  const resourcesAfter = collectContainerResources();
  const validationCompleted = new Date();

  const pipelineDurationSeconds = pipeline.first_received_at && pipeline.last_ieee_processed_at
    ? (Date.parse(pipeline.last_ieee_processed_at) - Date.parse(pipeline.first_received_at)) / 1000
    : 0;
  const droppedMessages = Math.max(0, acceptedMessages - Number(pipeline.raw_telemetry));
  const distinctCompletedReadings = Number(pipeline.ieee20305_unique_readings);
  const droppedReadings = Math.max(0, expectedReadings - distinctCompletedReadings);
  const successRate = expectedReadings > 0
    ? Number(((distinctCompletedReadings / expectedReadings) * 100).toFixed(2))
    : 0;

  const report = {
    run_id: runId,
    source,
    validation_started_at: validationStarted.toISOString(),
    validation_completed_at: validationCompleted.toISOString(),
    validation_uptime_seconds: Number(((validationCompleted - validationStarted) / 1000).toFixed(2)),
    configuration: {
      households: households.length,
      devices: devices.length,
      cycles: config.cycles,
      expected_telemetry_messages: expectedMessages,
      expected_normalized_readings: expectedReadings,
      randomized_interval_ms: {
        minimum: Math.min(...devices.map((entry) => entry.interval_ms)),
        maximum: Math.max(...devices.map((entry) => entry.interval_ms)),
        per_device: devices.map((entry) => ({
          device_id: entry.device.deviceId,
          device_type: entry.device.deviceType,
          household_id: entry.device.householdId,
          interval_ms: entry.interval_ms
        }))
      }
    },
    dependencies,
    generation: {
      ...generation,
      accepted_messages: acceptedMessages,
      rejected_messages: expectedMessages - acceptedMessages,
      generated_readings: generation.messages.reduce((sum, row) => sum + row.reading_count, 0)
    },
    pipeline: {
      ...pipeline,
      duration_seconds: Number(pipelineDurationSeconds.toFixed(2)),
      telemetry_throughput_messages_per_second: pipelineDurationSeconds > 0
        ? Number((Number(pipeline.raw_telemetry) / pipelineDurationSeconds).toFixed(3))
        : 0,
      reading_throughput_per_second: pipelineDurationSeconds > 0
        ? Number((Number(pipeline.ieee20305_events) / pipelineDurationSeconds).toFixed(3))
        : 0,
      dropped_messages: droppedMessages,
      dropped_readings: droppedReadings,
      overall_success_rate_percent: successRate
    },
    load_management: loadManagement,
    platform_status: {
      pipeline_status: platformStatus.body.platform?.pipeline_status,
      kafka_status: platformStatus.body.platform?.kafka?.status,
      kafka_topic_count: platformStatus.body.platform?.kafka?.topic_count,
      timescaledb_status: platformStatus.body.platform?.storage?.status,
      ollama_status: platformStatus.body.platform?.semantic?.ollama?.status,
      slm_primary_enabled: platformStatus.body.platform?.semantic?.ollama?.slm_primary_enabled,
      no_real_device_control: platformStatus.body.platform?.safety?.no_real_device_control
    },
    resources: {
      before: resourcesBefore,
      after: resourcesAfter,
      note: "Point-in-time Docker resource samples; not peak utilization measurements."
    },
    safety: {
      real_device_control: false,
      mock_dispatch_only: true,
      certified_ieee20305: false,
      certified_enershare: false,
      aws_deployed: false
    }
  };

  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  fs.writeFileSync(config.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Validation evidence written to ${config.output}`);
  console.log(JSON.stringify({
    run_id: runId,
    households: report.configuration.households,
    devices: report.configuration.devices,
    messages: report.pipeline.raw_telemetry,
    readings: report.pipeline.ieee20305_events,
    slm_calls: report.pipeline.slm_calls,
    slm_primary: report.pipeline.slm_primary,
    deterministic_fallback: report.pipeline.deterministic_fallback,
    unmapped: report.pipeline.unmapped,
    success_rate_percent: report.pipeline.overall_success_rate_percent,
    output: config.output
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildHouseholds,
  parseArguments,
  seededRandom,
  summarizeNumbers
};
