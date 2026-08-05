"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const {
  resolveConfig,
  runScaleGenerator
} = require("./run-scale-validation");

const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(repoRoot, "config", "scalability-10000.example.json");
const REQUIRED_SCALE_CATEGORIES = Object.freeze([
  "smart_meter",
  "smart_plug",
  "refrigerator",
  "washing_machine",
  "dishwasher",
  "lighting_circuit",
  "water_heater",
  "thermostat_hvac",
  "heat_pump",
  "ev_charger",
  "solar_inverter",
  "home_battery"
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quietErrors ? "ignore" : "pipe"],
    timeout: options.timeout || 60000
  }).trim();
}

function psqlJson(sql) {
  const output = docker([
    "compose", "exec", "-T", "timescaledb", "psql",
    "-U", process.env.TIMESCALE_USER || "energy_user",
    "-d", process.env.TIMESCALE_DB || "energy_flex",
    "-tA", "-c", sql
  ]);
  const line = output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1);
  return line ? JSON.parse(line) : {};
}

function readKafkaLag(groupId = process.env.SEMANTIC_CONNECTOR_GROUP_ID || "saref4ener-semantic-connector") {
  try {
    const output = docker([
      "compose", "exec", "-T", "kafka", "kafka-consumer-groups",
      "--bootstrap-server", "kafka:29092", "--describe",
      "--group", groupId
    ], { quietErrors: true });
    const partitions = output.split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 6 && parts[1] === "normalized.telemetry")
      .map((parts) => ({
        partition: Number(parts[2]),
        current_offset: Number(parts[3]),
        log_end_offset: Number(parts[4]),
        lag: Number(parts[5])
      }));
    return {
      status: partitions.length ? "ok" : "unavailable",
      total: partitions.reduce((sum, item) => sum + (Number.isFinite(item.lag) ? item.lag : 0), 0),
      partitions
    };
  } catch (error) {
    return { status: "unavailable", total: null, message: error.message };
  }
}

function readResources() {
  let containers = [];
  try {
    containers = docker(["stats", "--no-stream", "--format", "{{json .}}"], { quietErrors: true })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((row) => String(row.Name || "").startsWith("adflex-") || String(row.Name || "").includes("semantic-connector"))
      .map((row) => ({
        name: row.Name,
        cpu_percent: row.CPUPerc,
        memory_usage: row.MemUsage,
        memory_percent: row.MemPerc,
        processes: row.PIDs
      }));
  } catch (_error) {
    containers = [];
  }

  let gpu = null;
  try {
    const output = execFileSync("nvidia-smi", [
      "--query-gpu=name,utilization.gpu,memory.used,memory.total",
      "--format=csv,noheader,nounits"
    ], { encoding: "utf8", timeout: 15000 }).trim();
    const [name, utilization, memoryUsed, memoryTotal] = output.split(",").map((item) => item.trim());
    gpu = {
      name,
      utilization_percent: Number(utilization),
      memory_used_mib: Number(memoryUsed),
      memory_total_mib: Number(memoryTotal)
    };
  } catch (_error) {
    gpu = null;
  }
  return { containers, gpu };
}

function readSemanticRuntime() {
  try {
    const values = JSON.parse(docker([
      "inspect", "-f", "{{json .Config.Env}}", "iot-pipeline-semantic-connector-1"
    ], { quietErrors: true }));
    const environment = Object.fromEntries(values.map((item) => {
      const separator = item.indexOf("=");
      return [item.slice(0, separator), item.slice(separator + 1)];
    }));
    const allowed = [
      "SLM_PROVIDER", "SLM_MODEL", "SLM_TIMEOUT_MS", "SLM_MIN_CONFIDENCE",
      "SLM_BATCH_MAX_READINGS", "SLM_BATCH_MAX_WAIT_MS", "SLM_BATCH_MAX_PROMPT_TOKENS",
      "SLM_BATCH_MAX_RETRIES", "SLM_PROVIDER_MAX_CONCURRENCY",
      "SEMANTIC_PARTITIONS_CONCURRENTLY", "SEMANTIC_CONNECTOR_GROUP_ID"
    ];
    return Object.fromEntries(allowed.map((key) => [key, environment[key] || null]));
  } catch (error) {
    return { status: "unavailable", message: error.message };
  }
}

function isComposeServiceRunning(service) {
  try {
    return docker([
      "compose", "ps", "--status", "running", "--services"
    ], { quietErrors: true })
      .split(/\r?\n/)
      .some((item) => item.trim() === service);
  } catch (_error) {
    return false;
  }
}

function readHardware() {
  return {
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu_model: os.cpus()[0]?.model || "unknown",
    logical_cpu_count: os.cpus().length,
    total_memory_bytes: os.totalmem(),
    gpu: readResources().gpu,
    docker_desktop_memory_limit: "Measured from Docker container samples; host-specific setting not inferred."
  };
}

function queryRunMetrics(startedAt) {
  const start = sqlLiteral(startedAt);
  return psqlJson(`
    WITH run_readings AS (
      SELECT reading_id, event_time, processed_at, device_id, household_id
      FROM normalized_telemetry
      WHERE event_time >= ${start}::timestamptz
        AND source LIKE 'scale-%-simulator'
    ), run_audit AS (
      SELECT a.*
      FROM semantic_slm_audit a
      JOIN run_readings r USING (reading_id)
    ), run_batches AS (
      SELECT DISTINCT slm_batch_id FROM run_audit
    )
    SELECT json_build_object(
      'raw_messages', (SELECT count(*) FROM raw_telemetry WHERE event_time >= ${start}::timestamptz AND source LIKE 'scale-%-simulator'),
      'normalized_readings', (SELECT count(*) FROM run_readings),
      'unique_devices', (SELECT count(DISTINCT device_id) FROM run_readings),
      'unique_households', (SELECT count(DISTINCT household_id) FROM run_readings),
      'audited_readings', (SELECT count(*) FROM run_audit),
      'slm_called_readings', (SELECT count(*) FROM run_audit WHERE slm_called),
      'mapped_readings', (SELECT count(*) FROM run_audit WHERE final_status = 'mapped'),
      'safely_unmapped_readings', (SELECT count(*) FROM run_audit WHERE safely_unmapped),
      'output_received_readings', (SELECT count(*) FROM run_audit WHERE slm_output_received),
      'retried_readings', (SELECT count(*) FROM run_audit WHERE slm_attempt_count > 1),
      'retry_count', (SELECT coalesce(sum(GREATEST(slm_attempt_count - 1, 0)), 0) FROM run_audit),
      'semantic_rows', (SELECT count(*) FROM semantic_events s JOIN run_readings r USING (reading_id)),
      'ieee_rows', (SELECT count(*) FROM ieee20305_events i JOIN run_readings r USING (reading_id)),
      'duplicate_audit_ids', (SELECT count(*) FROM (SELECT reading_id FROM run_audit GROUP BY reading_id HAVING count(*) > 1) d),
      'duplicate_normalized_ids', (SELECT count(*) FROM (SELECT reading_id FROM run_readings GROUP BY reading_id HAVING count(*) > 1) d),
      'duplicate_semantic_ids', (SELECT count(*) FROM (SELECT s.reading_id FROM semantic_events s JOIN run_readings r USING (reading_id) GROUP BY s.reading_id HAVING count(*) > 1) d),
      'duplicate_ieee_ids', (SELECT count(*) FROM (SELECT i.reading_id FROM ieee20305_events i JOIN run_readings r USING (reading_id) GROUP BY i.reading_id HAVING count(*) > 1) d),
      'processing_errors', (SELECT count(*) FROM processing_errors WHERE occurred_at >= ${start}::timestamptz),
      'batch_count', (SELECT count(*) FROM semantic_batch_metrics b JOIN run_batches r USING (slm_batch_id)),
      'average_batch_size', (SELECT avg(input_readings) FROM semantic_batch_metrics b JOIN run_batches r USING (slm_batch_id)),
      'maximum_batch_size', (SELECT max(input_readings) FROM semantic_batch_metrics b JOIN run_batches r USING (slm_batch_id)),
      'average_database_latency_ms', (SELECT avg(database_latency_ms) FROM semantic_batch_metrics b JOIN run_batches r USING (slm_batch_id)),
      'slm_latency_p50_ms', (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY slm_inference_latency_ms) FROM run_audit),
      'slm_latency_p95_ms', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY slm_inference_latency_ms) FROM run_audit),
      'slm_latency_p99_ms', (SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY slm_inference_latency_ms) FROM run_audit),
      'end_to_end_p50_ms', (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY extract(epoch FROM (a.processed_at-r.event_time))*1000) FROM run_audit a JOIN run_readings r USING (reading_id)),
      'end_to_end_p95_ms', (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (a.processed_at-r.event_time))*1000) FROM run_audit a JOIN run_readings r USING (reading_id)),
      'end_to_end_p99_ms', (SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM (a.processed_at-r.event_time))*1000) FROM run_audit a JOIN run_readings r USING (reading_id)),
      'first_normalized_at', (SELECT min(processed_at) FROM run_readings),
      'last_audited_at', (SELECT max(processed_at) FROM run_audit),
      'providers', (SELECT coalesce(json_agg(DISTINCT slm_provider), '[]'::json) FROM run_audit),
      'models', (SELECT coalesce(json_agg(DISTINCT slm_model), '[]'::json) FROM run_audit),
      'workers', (SELECT coalesce(json_agg(DISTINCT slm_worker_id), '[]'::json) FROM run_audit)
    )::text;
  `);
}

function querySlmOutcomeSamples(startedAt, limit = 30) {
  const start = sqlLiteral(startedAt);
  const boundedLimit = Math.min(Math.max(Math.floor(number(limit, 30)), 1), 100);
  return psqlJson(`
    SELECT json_build_object(
      'samples',
      coalesce(json_agg(row_to_json(sample)), '[]'::json)
    )::text
    FROM (
      SELECT
        audit.reading_id,
        audit.device_id,
        readings.household_id,
        readings.reading_name,
        audit.slm_called,
        audit.slm_provider,
        audit.slm_model,
        audit.slm_batch_id,
        audit.slm_worker_id,
        audit.slm_attempt_count,
        audit.slm_inference_latency_ms,
        audit.slm_confidence,
        audit.deterministic_validation,
        audit.validation_failure_reason,
        audit.final_status,
        audit.safely_unmapped,
        audit.processed_at
      FROM semantic_slm_audit audit
      JOIN normalized_telemetry readings USING (reading_id)
      WHERE readings.event_time >= ${start}::timestamptz
        AND readings.source LIKE 'scale-%-simulator'
      ORDER BY audit.processed_at DESC
      LIMIT ${boundedLimit}
    ) sample;
  `);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 30000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function runSafeWorkflow(runId, gatewayUrl, edgeApiKey, options = {}) {
  const now = Date.now();
  const signalId = options.signalId || `${runId}-signal`;
  const headers = {
    "content-type": "application/json",
    "x-edge-api-key": edgeApiKey,
    "x-correlation-id": `${runId}-dso`
  };
  await fetchJson(`${gatewayUrl}/dso/grid-signal`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      signal_id: signalId,
      dso_id: "dso-scale-validation",
      community_id: "community-dublin-north",
      signal_type: "curtailment_request",
      severity: options.severity || "medium",
      requested_action: options.requestedAction || "reduce_load",
      start_time: new Date(now + 300000).toISOString(),
      end_time: new Date(now + 2100000).toISOString(),
      reason: options.reason || "Controlled SLM-first scalability validation"
    })
  });

  let proposal;
  for (let attempt = 0; attempt < 30 && !proposal; attempt += 1) {
    const body = await fetchJson(`${gatewayUrl}/dispatch/proposals?limit=100`, {
      headers: { "x-edge-api-key": edgeApiKey }
    });
    proposal = (body.proposals || []).find((item) => item.signal_id === signalId);
    if (!proposal) await sleep(2000);
  }
  if (!proposal) throw new Error("scale_workflow_proposal_not_created");

  const actionBody = JSON.stringify({
    reviewer_id: "scale-validation-operator",
    reviewer_role: "system-operator",
    comment: "Safe validation only. No real execution is permitted."
  });
  for (const action of ["review", "approve", "mark-ready"]) {
    await fetchJson(`${gatewayUrl}/approvals/proposals/${proposal.id}/${action}`, {
      method: "POST",
      headers: { ...headers, "x-correlation-id": `${runId}-${action}` },
      body: actionBody
    });
  }
  let evidence;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    evidence = psqlJson(`SELECT json_build_object(
      'proposal_id', ${sqlLiteral(proposal.id)},
      'dispatch_status', (SELECT status FROM dispatch_commands WHERE id=${number(proposal.id, 0)} ORDER BY created_at DESC LIMIT 1),
      'mock_rows', (SELECT count(*) FROM dispatch_execution_audit WHERE dispatch_command_id=${number(proposal.id, 0)}),
      'device_command_rows', (SELECT count(*) FROM device_command_audit WHERE correlation_id=${sqlLiteral(signalId)}),
      'unsafe_execution_rows', (
        (SELECT count(*) FROM dispatch_execution_audit
          WHERE dispatch_command_id=${number(proposal.id, 0)}
            AND (no_real_execution IS DISTINCT FROM TRUE OR execution_mode <> 'mock'))
        +
        (SELECT count(*) FROM device_command_audit
          WHERE correlation_id=${sqlLiteral(signalId)}
            AND (no_real_execution IS DISTINCT FROM TRUE OR execution_mode <> 'simulated_device_api'))
      )
    )::text;`);
    if (number(evidence.mock_rows) > 0 && number(evidence.device_command_rows) > 0) break;
    await sleep(2000);
  }
  const dataspace = await fetchJson(`${gatewayUrl}/dataspace/export/full-pipeline-demo-summary?limit=100`, {
    headers: { "x-edge-api-key": edgeApiKey, "x-correlation-id": `${runId}-dataspace` }
  });
  return {
    signal_id: signalId,
    ...evidence,
    dataspace_export_type: dataspace.export_type,
    dataspace_minimization_applied: dataspace.minimization_applied,
    dataspace_pseudonymization_applied: dataspace.pseudonymization_applied,
    no_raw_private_payloads: dataspace.no_raw_private_payloads
  };
}

async function runRepresentativeFlexibilityWorkflow(runId, gatewayUrl, edgeApiKey) {
  const profiles = ["apartment", "standard_home", "prosumer_home"];
  const cohorts = [];

  for (const profile of profiles) {
    const selectedHouseholds = psqlJson(`
      SELECT coalesce(json_agg(row_to_json(cohort)), '[]'::json)::text
      FROM (
        SELECT
          household_id,
          count(*)::integer AS asset_count,
          count(*) FILTER (WHERE flexibility_capable)::integer AS flexible_asset_count,
          coalesce(sum(maximum_flexible_power_kw) FILTER (
            WHERE flexibility_capable
          ), 0) AS maximum_flexible_power_kw
        FROM simulated_device_registry
        WHERE household_profile=${sqlLiteral(profile)}
          AND device_id LIKE 'scale1000-%'
        GROUP BY household_id
        ORDER BY household_id
        LIMIT 5
      ) cohort;
    `);
    if (!Array.isArray(selectedHouseholds) || selectedHouseholds.length !== 5) {
      throw new Error(`representative_${profile}_cohort_did_not_contain_five_households`);
    }

    const signalRunId = `${runId}-${profile.replaceAll("_", "-")}`;
    const householdIds = selectedHouseholds.map((item) => item.household_id);
    const workflow = await runSafeWorkflow(signalRunId, gatewayUrl, edgeApiKey, {
      signalId: `${signalRunId}-signal`,
      reason: `Controlled ${profile} cohort validation for ${householdIds.join(", ")}`
    });
    cohorts.push({
      household_profile: profile,
      selected_households: selectedHouseholds,
      selected_household_count: selectedHouseholds.length,
      ...workflow
    });
  }

  return {
    status: "completed",
    targeting_mode: "community_signal_with_audited_representative_cohort",
    cohort_dispatch_scope_enforced: false,
    cohort_count: cohorts.length,
    selected_household_count: cohorts.reduce(
      (total, cohort) => total + cohort.selected_household_count,
      0
    ),
    dispatch_status: cohorts.every(
      (cohort) => cohort.dispatch_status === "ready_to_dispatch"
    )
      ? "ready_to_dispatch"
      : "incomplete",
    mock_rows: cohorts.reduce((total, cohort) => total + number(cohort.mock_rows), 0),
    device_command_rows: cohorts.reduce(
      (total, cohort) => total + number(cohort.device_command_rows),
      0
    ),
    unsafe_execution_rows: cohorts.reduce(
      (total, cohort) => total + number(cohort.unsafe_execution_rows),
      0
    ),
    dataspace_export_type: cohorts.at(-1)?.dataspace_export_type || null,
    dataspace_minimization_applied: cohorts.every(
      (cohort) => cohort.dataspace_minimization_applied === true
    ),
    dataspace_pseudonymization_applied: cohorts.every(
      (cohort) => cohort.dataspace_pseudonymization_applied === true
    ),
    no_raw_private_payloads: cohorts.every(
      (cohort) => cohort.no_raw_private_payloads === true
    ),
    cohorts
  };
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const serialized = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${serialized.replaceAll('"', '""')}"`;
}

async function runStage(args = parseArgs()) {
  const baseConfig = JSON.parse(fs.readFileSync(path.resolve(args.config || defaultConfigPath), "utf8"));
  const devices = Math.floor(number(args.devices, 100));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runId = `scale-${devices}-${timestamp}`;
  const outputRoot = path.resolve(args.output || baseConfig.evidence.output_location || "docs/scalability-results");
  const runDirectory = path.join(outputRoot, runId);
  fs.mkdirSync(runDirectory, { recursive: true });
  const config = resolveConfig({ ...baseConfig, scenario_id: runId }, {
    devices,
    households: args.households === undefined ? undefined : number(args.households),
    intervalSeconds: args.intervalSeconds === undefined ? undefined : number(args.intervalSeconds),
    reportingWindowSeconds: args.reportingWindowSeconds === undefined
      ? undefined
      : number(args.reportingWindowSeconds),
    durationMinutes: args.durationMinutes === undefined ? undefined : number(args.durationMinutes),
    cycles: args.cycles === undefined ? undefined : number(args.cycles),
    seed: args.seed === undefined ? undefined : number(args.seed),
    rampUpSeconds: args.rampUpSeconds === undefined ? undefined : number(args.rampUpSeconds),
    burstPercentage: args.burstPercentage === undefined ? undefined : number(args.burstPercentage),
    burstAssets: args.burstAssets === undefined ? undefined : number(args.burstAssets),
    targetRate: args.targetRate === undefined ? undefined : number(args.targetRate),
    maxBacklog: args.maxBacklog === undefined ? undefined : number(args.maxBacklog),
    concurrency: args.concurrency === undefined ? undefined : number(args.concurrency),
    primaryReadingMode: args.primaryReadingMode,
    maxMessages: args.maxMessages === undefined ? undefined : number(args.maxMessages),
    mode: args.mode,
    output: outputRoot,
    dryRun: Boolean(args.dryRun)
  });
  const consumerGroup = args.consumerGroup ||
    process.env.SEMANTIC_CONNECTOR_GROUP_ID ||
    "saref4ener-semantic-connector";
  const semanticRuntimeAtStart = readSemanticRuntime();
  const continuousFleetRunningAtStart =
    isComposeServiceRunning("household-fleet-simulator");
  if (
    !config.dry_run &&
    semanticRuntimeAtStart.SEMANTIC_CONNECTOR_GROUP_ID !== consumerGroup
  ) {
    throw new Error(
      `Semantic runtime group '${semanticRuntimeAtStart.SEMANTIC_CONNECTOR_GROUP_ID || "unavailable"}' ` +
      `does not match validation group '${consumerGroup}'.`
    );
  }
  if (!config.dry_run && continuousFleetRunningAtStart) {
    throw new Error(
      "household-fleet-simulator must be stopped before a measured scale stage."
    );
  }
  const stageStartedAt = new Date(Date.now() - 1000).toISOString();
  const samplesPath = path.join(runDirectory, "pipeline-samples.jsonl");
  const sampleEveryMs = number(args.sampleEverySeconds, 5) * 1000;
  const sampler = spawn(process.execPath, [
    path.join(__dirname, "scale-sampler.js"),
    "--started-at", stageStartedAt,
    "--output", samplesPath,
    "--interval-ms", String(sampleEveryMs),
    "--consumer-group", consumerGroup
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] });

  const generator = await runScaleGenerator(config, { runDirectory });
  const deadline = Date.now() + number(args.maxClearanceSeconds, 900) * 1000;
  let metrics = queryRunMetrics(stageStartedAt);
  let lag = readKafkaLag(consumerGroup);
  while (Date.now() < deadline) {
    const terminal = number(metrics.audited_readings, 0);
    const acceptedReadings = number(generator.readings_gateway_accepted, generator.readings_generated);
    const mappedOrUnmapped =
      number(metrics.semantic_rows, 0) + number(metrics.safely_unmapped_readings, 0);
    const translatedOrUnmapped =
      number(metrics.ieee_rows, 0) + number(metrics.safely_unmapped_readings, 0);
    if (
      terminal >= acceptedReadings &&
      mappedOrUnmapped >= acceptedReadings &&
      translatedOrUnmapped >= acceptedReadings &&
      number(lag.total, 0) === 0
    ) break;
    process.stdout.write(`[scale-stage] normalized=${metrics.normalized_readings || 0} audited=${terminal}/${acceptedReadings} semantic_or_unmapped=${mappedOrUnmapped} ieee_or_unmapped=${translatedOrUnmapped} lag=${lag.total ?? "unavailable"}\n`);
    await sleep(sampleEveryMs);
    metrics = queryRunMetrics(stageStartedAt);
    lag = readKafkaLag(consumerGroup);
  }
  sampler.kill();
  await Promise.race([
    new Promise((resolve) => sampler.once("close", resolve)),
    sleep(5000)
  ]);
  metrics = queryRunMetrics(stageStartedAt);
  lag = readKafkaLag(consumerGroup);
  const samples = fs.existsSync(samplesPath)
    ? fs.readFileSync(samplesPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const maximumLag = samples.reduce(
    (maximum, sample) => Math.max(maximum, number(sample.kafka_lag?.total, 0)),
    0
  );
  fs.writeFileSync(
    path.join(runDirectory, "kafka-lag-samples.jsonl"),
    samples.map((sample) => JSON.stringify({
      recorded_at: sample.recorded_at,
      consumer_group: consumerGroup,
      ...sample.kafka_lag
    })).join("\n") + (samples.length ? "\n" : "")
  );
  fs.writeFileSync(
    path.join(runDirectory, "throughput-samples.jsonl"),
    samples.map((sample) => JSON.stringify({
      recorded_at: sample.recorded_at,
      normalized_readings: sample.metrics?.normalized_readings || 0,
      audited_readings: sample.metrics?.audited_readings || 0,
      semantic_rows: sample.metrics?.semantic_rows || 0,
      ieee_rows: sample.metrics?.ieee_rows || 0
    })).join("\n") + (samples.length ? "\n" : "")
  );
  fs.writeFileSync(
    path.join(runDirectory, "resource-samples.jsonl"),
    samples.map((sample) => JSON.stringify({
      recorded_at: sample.recorded_at,
      ...sample.resources
    })).join("\n") + (samples.length ? "\n" : "")
  );
  fs.writeFileSync(
    path.join(runDirectory, "slm-outcome-samples.json"),
    `${JSON.stringify(querySlmOutcomeSamples(stageStartedAt), null, 2)}\n`
  );

  const testMode = String(args.testMode || "functional").toLowerCase();
  let workflow = { status: "not_run" };
  if (!args.skipWorkflow && !config.dry_run) {
    try {
      const workflowEvidence =
        config.device_count === 1000 && testMode === "functional"
          ? await runRepresentativeFlexibilityWorkflow(
            runId,
            config.gateway.base_url.replace(/\/$/, ""),
            process.env.EDGE_API_KEY || "local-dev-edge-key"
          )
          : await runSafeWorkflow(
            runId,
            config.gateway.base_url.replace(/\/$/, ""),
            process.env.EDGE_API_KEY || "local-dev-edge-key"
          );
      workflow = {
        status: "completed",
        ...workflowEvidence
      };
    } catch (error) {
      workflow = { status: "failed", error: error.message };
    }
  }

  const firstNormalized = Date.parse(metrics.first_normalized_at || "");
  const lastAudited = Date.parse(metrics.last_audited_at || "");
  const processingSeconds = Number.isFinite(firstNormalized) && Number.isFinite(lastAudited)
    ? Math.max(0.001, (lastAudited - firstNormalized) / 1000)
    : 0;
  const sustainedArrivalRps = generator.readings_generated / Math.max(generator.elapsed_seconds, 0.001);
  const completionRps = number(metrics.audited_readings, 0) / Math.max(processingSeconds, 0.001);
  const semanticRuntimeAtCompletion = readSemanticRuntime();
  const continuousFleetRunningAtCompletion =
    isComposeServiceRunning("household-fleet-simulator");
  const criteria = {
    semantic_runtime_remained_isolated:
      semanticRuntimeAtStart.SEMANTIC_CONNECTOR_GROUP_ID === consumerGroup &&
      semanticRuntimeAtCompletion.SEMANTIC_CONNECTOR_GROUP_ID === consumerGroup,
    continuous_demo_fleet_remained_stopped:
      !continuousFleetRunningAtStart && !continuousFleetRunningAtCompletion,
    all_devices_represented: generator.represented_devices === config.device_count,
    all_households_represented: generator.represented_households === config.household_count,
    coverage_includes_every_device_category: testMode !== "coverage" ||
      REQUIRED_SCALE_CATEGORIES.every((category) =>
        number(generator.population?.categories?.[category], 0) > 0
      ),
    all_gateway_messages_accepted: generator.telemetry_gateway_accepted === generator.telemetry_planned,
    no_generator_drops: generator.telemetry_gateway_failed === 0,
    all_readings_normalized: number(metrics.normalized_readings, 0) === generator.readings_generated,
    all_readings_have_terminal_audit: number(metrics.audited_readings, 0) === generator.readings_generated,
    slm_called_for_all_readings: number(metrics.slm_called_readings, 0) === generator.readings_generated,
    all_readings_semantic_or_safely_unmapped:
      number(metrics.semantic_rows, 0) + number(metrics.safely_unmapped_readings, 0) ===
      generator.readings_generated,
    all_readings_ieee_or_safely_unmapped:
      number(metrics.ieee_rows, 0) + number(metrics.safely_unmapped_readings, 0) ===
      generator.readings_generated,
    no_duplicate_normalized_rows: number(metrics.duplicate_normalized_ids, 0) === 0,
    no_duplicate_audit_rows: number(metrics.duplicate_audit_ids, 0) === 0,
    no_duplicate_semantic_rows: number(metrics.duplicate_semantic_ids, 0) === 0,
    no_duplicate_ieee_rows: number(metrics.duplicate_ieee_ids, 0) === 0,
    no_processing_errors: number(metrics.processing_errors, 0) === 0,
    kafka_backlog_cleared: number(lag.total, -1) === 0,
    backlog_within_limit: maximumLag <= config.maximum_permitted_backlog_readings,
    safe_control_flow_completed: config.dry_run || (
      workflow.status === "completed" &&
      workflow.dispatch_status === "ready_to_dispatch" &&
      number(workflow.mock_rows, 0) > 0 &&
      number(workflow.device_command_rows, 0) > 0 &&
      number(workflow.unsafe_execution_rows, 0) === 0
    ),
    dataspace_export_completed: config.dry_run || workflow.dataspace_minimization_applied === true
  };
  const passed = !config.dry_run && Object.values(criteria).every(Boolean);
  const processingKeptUp = completionRps >= sustainedArrivalRps;
  const classification = config.dry_run
    ? "generator_only"
    : !passed
      ? "failed"
      : testMode === "sustained"
        ? processingKeptUp ? "sustained_local_pass" : "functional_only"
        : "functional_end_to_end_pass";
  const result = {
    run_id: runId,
    status: config.dry_run ? "generator_only" : passed ? "passed" : "failed",
    started_at: stageStartedAt,
    completed_at: new Date().toISOString(),
    configuration: config,
    consumer_group: consumerGroup,
    test_mode: testMode,
    classification,
    semantic_runtime: {
      started: semanticRuntimeAtStart,
      completed: semanticRuntimeAtCompletion
    },
    isolation: {
      continuous_demo_fleet_running_at_start: continuousFleetRunningAtStart,
      continuous_demo_fleet_running_at_completion: continuousFleetRunningAtCompletion
    },
    hardware: readHardware(),
    generator,
    pipeline: {
      ...metrics,
      final_kafka_lag: lag,
      maximum_observed_kafka_lag: maximumLag,
      sustained_arrival_readings_per_second: Number(sustainedArrivalRps.toFixed(3)),
      completion_readings_per_second: Number(completionRps.toFixed(3)),
      processing_kept_up_with_arrival: processingKeptUp,
      required_improvement_factor: completionRps > 0
        ? Number((sustainedArrivalRps / completionRps).toFixed(3))
        : null,
      slm_invocation_percentage: generator.readings_generated
        ? Number(((number(metrics.slm_called_readings, 0) / generator.readings_generated) * 100).toFixed(4))
        : 0,
      slm_acceptance_percentage: number(metrics.audited_readings, 0)
        ? Number(((number(metrics.mapped_readings, 0) / number(metrics.audited_readings, 1)) * 100).toFixed(4))
        : 0,
      safely_unmapped_percentage: number(metrics.audited_readings, 0)
        ? Number(((number(metrics.safely_unmapped_readings, 0) / number(metrics.audited_readings, 1)) * 100).toFixed(4))
        : 0
    },
    workflow,
    pass_criteria: criteria,
    output_directory: runDirectory,
    safety: {
      no_real_execution: true,
      real_device_control: false,
      certified_ieee20305: false,
      certified_enershare_or_ids: false
    }
  };
  fs.writeFileSync(path.join(runDirectory, "stage-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  const summary = {
    run_id: result.run_id,
    status: result.status,
    devices: config.device_count,
    households: generator.represented_households,
    telemetry_messages: generator.telemetry_attempted,
    readings: generator.readings_generated,
    slm_called: metrics.slm_called_readings,
    slm_invocation_percent: result.pipeline.slm_invocation_percentage,
    slm_accepted_percent: result.pipeline.slm_acceptance_percentage,
    safely_unmapped_percent: result.pipeline.safely_unmapped_percentage,
    arrival_readings_per_second: result.pipeline.sustained_arrival_readings_per_second,
    completion_readings_per_second: result.pipeline.completion_readings_per_second,
    max_kafka_lag: maximumLag,
    final_kafka_lag: lag.total,
    duplicate_semantic_ids: metrics.duplicate_semantic_ids,
    duplicate_ieee_ids: metrics.duplicate_ieee_ids,
    processing_errors: metrics.processing_errors
  };
  fs.writeFileSync(
    path.join(runDirectory, "stage-summary.csv"),
    `${Object.keys(summary).map(csvValue).join(",")}\n${Object.values(summary).map(csvValue).join(",")}\n`
  );
  return result;
}

async function main() {
  const result = await runStage();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "failed") process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  queryRunMetrics,
  querySlmOutcomeSamples,
  readKafkaLag,
  readResources,
  isComposeServiceRunning,
  runRepresentativeFlexibilityWorkflow,
  runSafeWorkflow,
  runStage
};
