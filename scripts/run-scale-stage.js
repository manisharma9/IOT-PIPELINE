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

function readKafkaLag() {
  try {
    const output = docker([
      "compose", "exec", "-T", "kafka", "kafka-consumer-groups",
      "--bootstrap-server", "kafka:29092", "--describe",
      "--group", process.env.SEMANTIC_CONNECTOR_GROUP_ID || "saref4ener-semantic-connector"
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs || 30000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function runSafeWorkflow(runId, gatewayUrl, edgeApiKey) {
  const now = Date.now();
  const signalId = `${runId}-signal`;
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
      severity: "medium",
      requested_action: "reduce_load",
      start_time: new Date(now + 300000).toISOString(),
      end_time: new Date(now + 2100000).toISOString(),
      reason: "Controlled SLM-first scalability validation"
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
      'device_command_rows', (SELECT count(*) FROM device_command_audit WHERE proposal_id=${sqlLiteral(String(proposal.id))}),
      'unsafe_execution_rows', (SELECT count(*) FROM dispatch_execution_audit WHERE dispatch_command_id=${number(proposal.id, 0)} AND (no_real_execution IS DISTINCT FROM TRUE OR execution_mode <> 'mock'))
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
    households: number(args.households, Math.ceil(devices / 3)),
    intervalSeconds: number(args.intervalSeconds, 60),
    durationMinutes: number(args.durationMinutes, 1),
    cycles: number(args.cycles, 1),
    seed: number(args.seed, baseConfig.random_seed),
    rampUpSeconds: number(args.rampUpSeconds, 0),
    burstPercentage: number(args.burstPercentage, 0),
    targetRate: number(args.targetRate, devices / number(args.intervalSeconds, 60)),
    maxBacklog: number(args.maxBacklog, baseConfig.maximum_permitted_backlog_readings),
    concurrency: number(args.concurrency, baseConfig.gateway.concurrency),
    mode: args.mode || "steady",
    output: outputRoot,
    dryRun: Boolean(args.dryRun)
  });
  const stageStartedAt = new Date(Date.now() - 1000).toISOString();
  const samplesPath = path.join(runDirectory, "pipeline-samples.jsonl");
  const sampleEveryMs = number(args.sampleEverySeconds, 5) * 1000;
  const sampler = spawn(process.execPath, [
    path.join(__dirname, "scale-sampler.js"),
    "--started-at", stageStartedAt,
    "--output", samplesPath,
    "--interval-ms", String(sampleEveryMs)
  ], { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] });

  const generator = await runScaleGenerator(config, { runDirectory });
  const deadline = Date.now() + number(args.maxClearanceSeconds, 900) * 1000;
  let metrics = queryRunMetrics(stageStartedAt);
  let lag = readKafkaLag();
  while (Date.now() < deadline) {
    const terminal = number(metrics.audited_readings, 0);
    const acceptedReadings = number(generator.readings_gateway_accepted, generator.readings_generated);
    if (terminal >= acceptedReadings && number(lag.total, 0) === 0) break;
    process.stdout.write(`[scale-stage] normalized=${metrics.normalized_readings || 0} audited=${terminal}/${acceptedReadings} accepted readings (${generator.readings_generated} generated) lag=${lag.total ?? "unavailable"}\n`);
    await sleep(sampleEveryMs);
    metrics = queryRunMetrics(stageStartedAt);
    lag = readKafkaLag();
  }
  sampler.kill();
  await Promise.race([
    new Promise((resolve) => sampler.once("close", resolve)),
    sleep(5000)
  ]);
  metrics = queryRunMetrics(stageStartedAt);
  lag = readKafkaLag();
  const samples = fs.existsSync(samplesPath)
    ? fs.readFileSync(samplesPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const maximumLag = samples.reduce(
    (maximum, sample) => Math.max(maximum, number(sample.kafka_lag?.total, 0)),
    0
  );

  let workflow = { status: "not_run" };
  if (!args.skipWorkflow && !config.dry_run) {
    try {
      workflow = {
        status: "completed",
        ...(await runSafeWorkflow(
          runId,
          config.gateway.base_url.replace(/\/$/, ""),
          process.env.EDGE_API_KEY || "local-dev-edge-key"
        ))
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
  const criteria = {
    all_devices_represented: generator.represented_devices === config.device_count,
    all_gateway_messages_accepted: generator.telemetry_gateway_accepted === generator.telemetry_planned,
    all_readings_normalized: number(metrics.normalized_readings, 0) === generator.readings_generated,
    all_readings_have_terminal_audit: number(metrics.audited_readings, 0) === generator.readings_generated,
    slm_called_for_all_readings: number(metrics.slm_called_readings, 0) === generator.readings_generated,
    no_duplicate_audit_rows: number(metrics.duplicate_audit_ids, 0) === 0,
    no_duplicate_semantic_rows: number(metrics.duplicate_semantic_ids, 0) === 0,
    no_duplicate_ieee_rows: number(metrics.duplicate_ieee_ids, 0) === 0,
    no_processing_errors: number(metrics.processing_errors, 0) === 0,
    kafka_backlog_cleared: number(lag.total, -1) === 0,
    backlog_within_limit: maximumLag <= config.maximum_permitted_backlog_readings,
    processing_kept_up_with_arrival: completionRps >= sustainedArrivalRps,
    safe_control_flow_completed: config.dry_run || (workflow.status === "completed" && number(workflow.unsafe_execution_rows, 0) === 0),
    dataspace_export_completed: config.dry_run || workflow.dataspace_minimization_applied === true
  };
  const passed = !config.dry_run && Object.values(criteria).every(Boolean);
  const result = {
    run_id: runId,
    status: config.dry_run ? "generator_only" : passed ? "passed" : "failed",
    started_at: stageStartedAt,
    completed_at: new Date().toISOString(),
    configuration: config,
    semantic_runtime: readSemanticRuntime(),
    hardware: readHardware(),
    generator,
    pipeline: {
      ...metrics,
      final_kafka_lag: lag,
      maximum_observed_kafka_lag: maximumLag,
      sustained_arrival_readings_per_second: Number(sustainedArrivalRps.toFixed(3)),
      completion_readings_per_second: Number(completionRps.toFixed(3)),
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
  readKafkaLag,
  readResources,
  runStage
};
