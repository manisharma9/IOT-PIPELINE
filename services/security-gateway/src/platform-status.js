"use strict";

const PIPELINE_BLOCKS = Object.freeze([
  ["devices", "Devices", "Simulators publish local telemetry and receive simulated command responses."],
  ["security", "Security Gateway", "Gateway authentication, request inspection, rate limiting, correlation IDs, and audit."],
  ["ingestion", "Ingestion API", "HTTP and compatibility ingestion into raw.telemetry."],
  ["kafka", "Kafka Digital Spine", "Event topics connecting every pipeline stage."],
  ["engine", "Engine", "Raw telemetry normalization into normalized.telemetry."],
  ["semantic", "Semantic Connector", "Mandatory SLM mapping with SAREF4ENER validation, retry, and safe rejection."],
  ["storage", "TimescaleDB", "Historical telemetry, semantic events, command history, and audit records."],
  ["ieee20305", "IEEE 2030.5", "MirrorMeterReading, DERStatus, and GridSignal-style translation foundation."],
  ["aggregator", "Aggregator", "DSO grid signals become safe dispatch proposals."],
  ["approval", "Approval Workflow", "Review, approval, rejection, and ready-to-dispatch status changes."],
  ["mock-dispatch", "Mock Dispatch", "Simulated dispatch sent/result events. No real execution."],
  ["device-command", "Device Command Translator", "Simulated Shelly, Enode / Easee, and Heat Pump API command translation."],
  ["dataspace", "Dataspace Export", "Minimized and pseudonymized export foundation."],
  ["dashboard", "Customer Console", "Client-facing dashboard through Next.js API routes."]
]);

const TABLES = Object.freeze([
  "raw_telemetry",
  "normalized_telemetry",
  "semantic_events",
  "semantic_slm_audit",
  "semantic_batch_metrics",
  "ieee20305_events",
  "dispatch_commands",
  "dispatch_approval_audit",
  "dispatch_execution_audit",
  "device_command_audit",
  "dataspace_exports",
  "security_gateway_audit",
  "processing_errors"
]);

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function safeQuery(pool, sql, params = [], fallback = []) {
  if (!pool || typeof pool.query !== "function") {
    return fallback;
  }

  try {
    const result = await pool.query(sql, params);
    return result.rows || fallback;
  } catch (error) {
    return fallback;
  }
}

async function getTableCounts(pool) {
  const counts = {};
  for (const table of TABLES) {
    const rows = await safeQuery(pool, `SELECT count(*)::bigint AS count FROM ${table}`, [], [
      { count: 0 }
    ]);
    counts[table] = toInt(rows[0]?.count);
  }
  return counts;
}

function semanticRow(row) {
  return {
    event_time: row.event_time,
    processed_at: row.processed_at,
    household_id: row.household_id,
    community_id: row.community_id,
    device_id: row.device_id,
    device_type: row.device_type,
    reading_name: row.reading_name,
    reading_value: row.reading_value,
    reading_unit: row.reading_unit,
    mapping_source: row.mapping_source,
    mapping_confidence: row.mapping_confidence,
    saref_property: row.saref_property,
    saref_unit: row.saref_unit,
    saref4ener_concept: row.saref4ener_concept,
    ngsi_property: row.ngsi_property,
    explanation: row.explanation,
    fallback_reason: row.fallback_reason || null,
    slm_model: row.slm_model || null,
    slm_called: row.slm_called === true || row.slm_called === "true",
    deterministic_validation: row.deterministic_validation || null
  };
}

async function getSemanticSummary(pool) {
  const latestRows = await safeQuery(
    pool,
    `
      SELECT
        event_time,
        processed_at,
        household_id,
        community_id,
        device_id,
        device_type,
        reading_name,
        reading_value,
        reading_unit,
        mapping_source,
        mapping_confidence,
        saref_property,
        saref_unit,
        saref4ener_concept,
        ngsi_property,
        explanation,
        semantic_payload->'slm_audit'->>'fallback_reason' AS fallback_reason,
        semantic_payload->'slm_audit'->>'slm_model' AS slm_model,
        semantic_payload->'slm_audit'->>'slm_called' AS slm_called,
        semantic_payload->'slm_audit'->>'deterministic_validation' AS deterministic_validation
      FROM semantic_events
      ORDER BY processed_at DESC
      LIMIT 12
    `
  );

  const counts = await safeQuery(
    pool,
    `
      SELECT
        count(*) FILTER (WHERE slm_called)::bigint AS slm_call_count,
        count(*) FILTER (WHERE final_status = 'mapped')::bigint AS successful_slm_mappings,
        0::bigint AS deterministic_fallback_count,
        count(*) FILTER (WHERE safely_unmapped)::bigint AS unmapped_count,
        count(*)::bigint AS total_semantic_events
      FROM semantic_slm_audit
    `,
    [],
    [{}]
  );

  const confidenceRows = await safeQuery(
    pool,
    `
      SELECT mapping_confidence, count(*)::bigint AS count
      FROM semantic_events
      GROUP BY mapping_confidence
      ORDER BY mapping_confidence
    `
  );

  return {
    counts: {
      slm_call_count: toInt(counts[0]?.slm_call_count),
      successful_slm_mappings: toInt(counts[0]?.successful_slm_mappings),
      deterministic_fallback_count: toInt(counts[0]?.deterministic_fallback_count),
      unmapped_count: toInt(counts[0]?.unmapped_count),
      total_semantic_events: toInt(counts[0]?.total_semantic_events)
    },
    confidence_mix: confidenceRows.map((row) => ({
      confidence: row.mapping_confidence || "unknown",
      count: toInt(row.count)
    })),
    latest_mappings: latestRows.map(semanticRow)
  };
}

async function getScalabilitySummary(pool, kafka, windowMinutes = 60) {
  const window = Math.max(1, Math.min(1440, Number(windowMinutes) || 60));
  const population = await safeQuery(pool, `
    SELECT
      count(*)::bigint AS normalized_readings,
      count(DISTINCT device_id)::bigint AS total_devices,
      count(DISTINCT household_id)::bigint AS active_households,
      min(event_time) AS first_event_time,
      max(event_time) AS last_event_time
    FROM normalized_telemetry
    WHERE event_time >= now() - ($1::text || ' minutes')::interval
  `, [window], [{}]);
  const rawPopulation = await safeQuery(pool, `
    SELECT count(*)::bigint AS raw_messages
    FROM raw_telemetry
    WHERE event_time >= now() - ($1::text || ' minutes')::interval
  `, [window], [{}]);
  const slm = await safeQuery(pool, `
    SELECT
      count(*)::bigint AS audited_readings,
      count(*) FILTER (WHERE slm_called)::bigint AS slm_called_readings,
      count(*) FILTER (WHERE final_status = 'mapped')::bigint AS mapped_readings,
      count(*) FILTER (WHERE safely_unmapped)::bigint AS safely_unmapped_readings,
      count(*) FILTER (WHERE slm_attempt_count > 1)::bigint AS retried_readings,
      coalesce(sum(GREATEST(slm_attempt_count - 1, 0)), 0)::bigint AS retry_count,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY slm_inference_latency_ms) AS slm_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY slm_inference_latency_ms) AS slm_p95_ms,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY slm_inference_latency_ms) AS slm_p99_ms,
      avg(slm_confidence) FILTER (WHERE slm_confidence IS NOT NULL) AS average_confidence,
      min(processed_at) AS first_processed_at,
      max(processed_at) AS last_processed_at
    FROM semantic_slm_audit
    WHERE event_time >= now() - ($1::text || ' minutes')::interval
  `, [window], [{}]);
  const batches = await safeQuery(pool, `
    SELECT
      count(*)::bigint AS batch_count,
      avg(input_readings) AS average_batch_size,
      max(input_readings)::bigint AS maximum_batch_size,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY total_latency_ms) AS batch_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY total_latency_ms) AS batch_p95_ms,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY total_latency_ms) AS batch_p99_ms,
      avg(queue_time_ms) AS average_queue_time_ms,
      avg(database_latency_ms) AS average_database_latency_ms
    FROM semantic_batch_metrics
    WHERE event_time >= now() - ($1::text || ' minutes')::interval
  `, [window], [{}]);
  const duplicates = await safeQuery(pool, `
    SELECT
      (SELECT count(*) FROM (
        SELECT reading_id FROM semantic_events WHERE reading_id IS NOT NULL
        GROUP BY reading_id HAVING count(*) > 1
      ) duplicate_semantic) AS duplicate_semantic_rows,
      (SELECT count(*) FROM (
        SELECT reading_id FROM ieee20305_events WHERE reading_id IS NOT NULL
        GROUP BY reading_id HAVING count(*) > 1
      ) duplicate_ieee_rows,
      (SELECT count(*) FROM processing_errors
        WHERE occurred_at >= now() - ($1::text || ' minutes')::interval) AS processing_errors
  `, [window], [{}]);

  const normalized = toInt(population[0]?.normalized_readings);
  const rawMessages = toInt(rawPopulation[0]?.raw_messages);
  const audited = toInt(slm[0]?.audited_readings);
  const slmCalled = toInt(slm[0]?.slm_called_readings);
  const first = population[0]?.first_event_time ? Date.parse(population[0].first_event_time) : NaN;
  const last = population[0]?.last_event_time ? Date.parse(population[0].last_event_time) : NaN;
  const durationSeconds = Number.isFinite(first) && Number.isFinite(last)
    ? Math.max(1, (last - first) / 1000)
    : window * 60;

  const kafkaLag = await getSemanticConsumerLag(kafka);
  return {
    window_minutes: window,
    total_simulated_devices: toInt(population[0]?.total_devices),
    active_households: toInt(population[0]?.active_households),
    raw_messages: rawMessages,
    normalized_readings: normalized,
    audited_readings: audited,
    telemetry_rate_per_second: Number((rawMessages / durationSeconds).toFixed(3)),
    normalized_reading_rate_per_second: Number((normalized / durationSeconds).toFixed(3)),
    slm_invocation_percentage: normalized ? Number(((slmCalled / normalized) * 100).toFixed(4)) : 0,
    slm_primary_acceptance_rate: audited
      ? Number(((toInt(slm[0]?.mapped_readings) / audited) * 100).toFixed(4))
      : 0,
    safely_unmapped_rate: audited
      ? Number(((toInt(slm[0]?.safely_unmapped_readings) / audited) * 100).toFixed(4))
      : 0,
    retry_rate: audited
      ? Number(((toInt(slm[0]?.retried_readings) / audited) * 100).toFixed(4))
      : 0,
    retry_count: toInt(slm[0]?.retry_count),
    missing_final_outcomes: Math.max(0, normalized - audited),
    average_confidence: Number(slm[0]?.average_confidence || 0),
    slm_latency_ms: {
      p50: Number(slm[0]?.slm_p50_ms || 0),
      p95: Number(slm[0]?.slm_p95_ms || 0),
      p99: Number(slm[0]?.slm_p99_ms || 0)
    },
    batches: {
      count: toInt(batches[0]?.batch_count),
      average_size: Number(batches[0]?.average_batch_size || 0),
      maximum_size: toInt(batches[0]?.maximum_batch_size),
      p50_ms: Number(batches[0]?.batch_p50_ms || 0),
      p95_ms: Number(batches[0]?.batch_p95_ms || 0),
      p99_ms: Number(batches[0]?.batch_p99_ms || 0),
      average_queue_time_ms: Number(batches[0]?.average_queue_time_ms || 0),
      average_database_latency_ms: Number(batches[0]?.average_database_latency_ms || 0)
    },
    kafka_lag: kafkaLag,
    duplicate_semantic_rows: toInt(duplicates[0]?.duplicate_semantic_rows),
    duplicate_ieee_rows: toInt(duplicates[0]?.duplicate_ieee_rows),
    processing_errors: toInt(duplicates[0]?.processing_errors),
    current_test_stage: "operator_selected",
    no_real_execution: true
  };
}

async function getSemanticConsumerLag(kafka) {
  if (!kafka || typeof kafka.admin !== "function") return { status: "unavailable", total: null };
  const admin = kafka.admin();
  try {
    await admin.connect();
    const offsets = await admin.fetchOffsets({
      groupId: process.env.SEMANTIC_CONNECTOR_GROUP_ID || "saref4ener-semantic-connector",
      topics: ["normalized.telemetry"],
      resolveOffsets: true
    });
    const partitions = offsets.flatMap((topic) => (topic.partitions || []).map((partition) => ({
      topic: topic.topic,
      partition: partition.partition,
      offset: partition.offset,
      high: partition.high,
      lag: Math.max(0, Number(partition.high || 0) - Number(partition.offset || 0))
    })));
    return {
      status: "ok",
      total: partitions.reduce((sum, partition) => sum + partition.lag, 0),
      partitions
    };
  } catch (error) {
    return { status: "unavailable", total: null, message: error.message };
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

async function listScalabilityDevices(pool, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));
  const offset = Math.max(0, Number(options.offset) || 0);
  const rows = await safeQuery(pool, `
    WITH latest AS (
      SELECT DISTINCT ON (device_id)
        device_id, household_id, community_id, device_type, reading_name,
        reading_value, reading_unit, event_time, processed_at,
        mapping_source, mapping_confidence, final_status, safely_unmapped
      FROM semantic_events
      ORDER BY device_id, processed_at DESC
    )
    SELECT *, count(*) OVER()::bigint AS total_count
    FROM latest
    ORDER BY device_id
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  return {
    limit,
    offset,
    total: toInt(rows[0]?.total_count),
    devices: rows.map(({ total_count: _total, ...row }) => row)
  };
}

async function getDeviceInsights(pool) {
  const rows = await safeQuery(
    pool,
    `
      SELECT *
      FROM (
        SELECT DISTINCT ON (device_id)
          event_time,
          processed_at,
          device_id,
          device_type,
          reading_name,
          reading_value,
          reading_unit,
          mapping_source,
          mapping_confidence,
          saref4ener_concept
        FROM semantic_events
        WHERE device_id IN ('shelly-plug-001', 'easee-core-001', 'heat-pump-001')
           OR device_type IN ('shelly_plug', 'ev_charger', 'heat_pump', 'unknown_sensor', 'grid_sensor')
        ORDER BY device_id, processed_at DESC
      ) latest_devices
      ORDER BY processed_at DESC
      LIMIT 20
    `
  );

  return rows.map((row) => ({
    device_id: row.device_id,
    device_type: row.device_type,
    latest_reading: row.reading_name,
    value: row.reading_value,
    unit: row.reading_unit,
    last_message_time: row.processed_at || row.event_time,
    semantic_status: row.mapping_source,
    storage_status: "stored",
    mapping_confidence: row.mapping_confidence,
    saref4ener_concept: row.saref4ener_concept
  }));
}

async function getSecuritySummary(pool) {
  const summary = await safeQuery(
    pool,
    `
      SELECT
        count(*) FILTER (WHERE decision = 'accepted')::bigint AS accepted,
        count(*) FILTER (WHERE decision IN ('blocked', 'unauthorized', 'rate_limited'))::bigint AS rejected,
        count(*) FILTER (WHERE decision = 'blocked')::bigint AS blocked,
        count(*) FILTER (WHERE decision = 'rate_limited')::bigint AS rate_limited,
        count(*) FILTER (WHERE correlation_id IS NOT NULL)::bigint AS correlation_ids
      FROM security_gateway_audit
    `,
    [],
    [{}]
  );

  const unsafe = await safeQuery(
    pool,
    `
      SELECT reason, count(*)::bigint AS count
      FROM security_gateway_audit
      WHERE decision IN ('blocked', 'unauthorized', 'rate_limited')
      GROUP BY reason
      ORDER BY count(*) DESC
      LIMIT 8
    `
  );

  const latest = await safeQuery(
    pool,
    `
      SELECT
        event_time,
        correlation_id,
        method,
        route,
        decision,
        reason,
        status_code,
        target_service,
        request_hash,
        auth_mode
      FROM security_gateway_audit
      ORDER BY created_at DESC
      LIMIT 8
    `
  );

  return {
    api_key_validation: "enabled",
    rate_limit_status: "enabled",
    accepted_requests: toInt(summary[0]?.accepted),
    rejected_requests: toInt(summary[0]?.rejected),
    blocked_unsafe_payloads: toInt(summary[0]?.blocked),
    rate_limited_requests: toInt(summary[0]?.rate_limited),
    correlation_id_count: toInt(summary[0]?.correlation_ids),
    rejected_reason_mix: unsafe.map((row) => ({
      reason: row.reason || "unknown",
      count: toInt(row.count)
    })),
    latest_audit_rows: latest
  };
}

async function getLoadManagementSummary(pool) {
  const proposals = await safeQuery(
    pool,
    `
      SELECT
        id,
        event_time,
        created_at,
        signal_id,
        community_id,
        household_id,
        device_id,
        requested_action,
        proposed_action,
        target_kw,
        priority,
        status,
        reason,
        correlation_id
      FROM dispatch_commands
      ORDER BY created_at DESC
      LIMIT 8
    `
  );

  const statusRows = await safeQuery(
    pool,
    `
      SELECT status, count(*)::bigint AS count
      FROM dispatch_commands
      GROUP BY status
      ORDER BY status
    `
  );

  const mockRows = await safeQuery(
    pool,
    `
      SELECT
        event_time,
        dispatch_command_id,
        proposal_id,
        device_id,
        device_type,
        proposed_action,
        simulation_status,
        simulation_message,
        no_real_execution,
        execution_mode
      FROM dispatch_execution_audit
      ORDER BY created_at DESC
      LIMIT 6
    `
  );

  const deviceRows = await safeQuery(
    pool,
    `
      SELECT
        event_time,
        command_id,
        proposal_id,
        device_id,
        device_type,
        provider,
        requested_reduction_kw,
        allocated_reduction_kw,
        action,
        execution_mode,
        no_real_execution,
        status
      FROM device_command_audit
      ORDER BY created_at DESC
      LIMIT 6
    `
  );

  return {
    proposal_status_counts: statusRows.map((row) => ({
      status: row.status || "unknown",
      count: toInt(row.count)
    })),
    latest_proposals: proposals,
    mock_dispatch_results: mockRows,
    device_command_outputs: deviceRows,
    safety: {
      no_real_execution_required: true,
      real_device_control: false
    }
  };
}

async function getStorageLatest(pool) {
  const latestSemantic = await safeQuery(
    pool,
    "SELECT processed_at AS latest_event_time FROM semantic_events ORDER BY processed_at DESC LIMIT 1",
    [],
    [{}]
  );
  const latestRaw = await safeQuery(
    pool,
    "SELECT received_at AS latest_event_time FROM raw_telemetry ORDER BY received_at DESC LIMIT 1",
    [],
    [{}]
  );
  const latestSecurity = await safeQuery(
    pool,
    "SELECT created_at AS latest_event_time FROM security_gateway_audit ORDER BY created_at DESC LIMIT 1",
    [],
    [{}]
  );

  return {
    latest_raw_telemetry_time: latestRaw[0]?.latest_event_time || null,
    latest_semantic_event_time: latestSemantic[0]?.latest_event_time || null,
    latest_security_audit_time: latestSecurity[0]?.latest_event_time || null
  };
}

async function getDataspaceSummary(pool) {
  const latest = await safeQuery(
    pool,
    `
      SELECT
        event_time,
        export_type,
        requester_id,
        requester_role,
        community_id,
        record_count,
        access_policy,
        minimization_applied,
        pseudonymization_applied,
        export_status,
        correlation_id
      FROM dataspace_exports
      ORDER BY created_at DESC
      LIMIT 5
    `
  );

  return {
    status: latest.length ? "available" : "waiting_for_exports",
    catalog_endpoint: "/dataspace/catalog",
    export_endpoint: "/dataspace/export/full-pipeline-demo-summary",
    foundation_only: true,
    certification_claimed: false,
    latest_exports: latest
  };
}

async function getOllamaStatus(config, ollamaFetch = fetch) {
  try {
    const response = await ollamaFetch(`${config.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`, {
      method: "GET"
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        phi3_mini_available: false,
        model: config.slmModel,
        slm_primary_enabled: config.slmPrimary
      };
    }

    const body = await response.json();
    const modelNames = Array.isArray(body.models)
      ? body.models.map((model) => model.name || model.model).filter(Boolean)
      : [];
    return {
      status: "ok",
      phi3_mini_available: modelNames.includes(config.slmModel),
      model: config.slmModel,
      models: modelNames,
      slm_primary_enabled: config.slmPrimary
    };
  } catch (error) {
    return {
      status: "unavailable",
      phi3_mini_available: false,
      model: config.slmModel,
      slm_primary_enabled: config.slmPrimary,
      message: error.message
    };
  }
}

async function getKafkaTopics(kafka) {
  if (!kafka || typeof kafka.admin !== "function") {
    return {
      status: "unavailable",
      topics: []
    };
  }

  const admin = kafka.admin();
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    return {
      status: "ok",
      topic_count: topics.length,
      topics: topics.sort()
    };
  } catch (error) {
    return {
      status: "unavailable",
      topics: [],
      message: error.message
    };
  } finally {
    try {
      await admin.disconnect();
    } catch (_error) {
      // Ignore cleanup errors for a read-only status endpoint.
    }
  }
}

function buildPipelineBlocks(downstream, storageLatest, kafka, semantic) {
  const healthByService = new Map(
    downstream.map((service) => [service.service, service.status || "unknown"])
  );
  return PIPELINE_BLOCKS.map(([id, label, purpose]) => {
    const serviceLookup = {
      ingestion: "ingestion-api",
      semantic: "semantic-connector",
      ieee20305: "ieee20305-translator",
      aggregator: "aggregator",
      approval: "approval-workflow",
      "mock-dispatch": "mock-dispatch-adapter",
      "device-command": "device-command-translator",
      dataspace: "dataspace-export"
    };
    const status =
      id === "kafka" ? kafka.status :
      id === "storage" ? "ok" :
      id === "devices" ? "ok" :
      id === "dashboard" ? "ok" :
      healthByService.get(serviceLookup[id]) || "ok";

    const latestEventTime =
      id === "semantic" ? storageLatest.latest_semantic_event_time :
      id === "storage" ? storageLatest.latest_semantic_event_time || storageLatest.latest_raw_telemetry_time :
      id === "security" ? storageLatest.latest_security_audit_time :
      id === "kafka" ? storageLatest.latest_raw_telemetry_time :
      semantic.latest_mappings[0]?.processed_at || null;

    return {
      id,
      label,
      purpose,
      status,
      latest_event_time: latestEventTime
    };
  });
}

async function buildPlatformStatus({
  pool,
  config,
  kafka,
  healthFetch = fetch,
  ollamaFetch = fetch
}) {
  const [
    table_counts,
    semantic,
    devices,
    security,
    load_management,
    storage_latest,
    dataspace,
    ollama,
    kafkaStatus,
    scalability
  ] = await Promise.all([
    getTableCounts(pool),
    getSemanticSummary(pool),
    getDeviceInsights(pool),
    getSecuritySummary(pool),
    getLoadManagementSummary(pool),
    getStorageLatest(pool),
    getDataspaceSummary(pool),
    getOllamaStatus(config, ollamaFetch),
    getKafkaTopics(kafka),
    getScalabilitySummary(pool, kafka)
  ]);

  const downstream = await require("./index").readDownstreamHealth(config, healthFetch);

  return {
    generated_at: new Date().toISOString(),
    pipeline_status: downstream.every((service) => service.status === "ok") && kafkaStatus.status === "ok"
      ? "operational"
      : "degraded",
    services: {
      gateway: {
        service: "security-gateway",
        status: "ok",
        external_entry_point: true
      },
      downstream
    },
    kafka: kafkaStatus,
    storage: {
      status: "ok",
      table_counts,
      latest: storage_latest
    },
    semantic: {
      ...semantic,
      ollama,
      primary_semantic_mapper: "Phi-3 Mini via local Ollama",
      deterministic_mapping_role: "validation_guardrail_only"
    },
    devices,
    security,
    load_management,
    dataspace,
    scalability,
    pipeline_blocks: buildPipelineBlocks(downstream, storage_latest, kafkaStatus, semantic),
    safety: {
      no_real_device_control: true,
      mock_dispatch_only: true,
      certified_ieee20305: false,
      certified_enershare: false,
      aws_deployed: false
    }
  };
}

module.exports = {
  buildPlatformStatus,
  buildPipelineBlocks,
  getDeviceInsights,
  getKafkaTopics,
  getOllamaStatus,
  getSecuritySummary,
  getSemanticSummary,
  getScalabilitySummary,
  getSemanticConsumerLag,
  listScalabilityDevices,
  getTableCounts
};
