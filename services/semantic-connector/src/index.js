"use strict";

const crypto = require("node:crypto");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { Kafka } = require("kafkajs");
const {
  createPool,
  ensureSemanticEventsTable,
  insertBatchMetrics,
  insertSemanticOutcome
} = require("./db");
const { mapReadingBatch } = require("./batch-mapper");
const { buildMappingFromOutcome, buildSlmAuditRecord } = require("./outcome-builder");
const { createInferenceProvider, getProviderConfig } = require("./providers");
const { getBatchConfig, splitReadingBatches } = require("./reading-batcher");
const {
  buildSemanticEvent,
  buildSemanticPayload,
  validateNormalizedTelemetryEvent
} = require("./semantic-builder");

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "adflex-semantic-connector";
const NORMALIZED_TELEMETRY_TOPIC = process.env.NORMALIZED_TELEMETRY_TOPIC || "normalized.telemetry";
const SEMANTIC_ENRICHED_TOPIC = process.env.SEMANTIC_ENRICHED_TOPIC || "semantic.enriched";
const SEMANTIC_RETRY_TOPIC = process.env.SEMANTIC_RETRY_TOPIC || "semantic.mapping.retry";
const SEMANTIC_DLQ_TOPIC = process.env.SEMANTIC_DLQ_TOPIC || "semantic.mapping.dlq";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getWorkerId(env = process.env) {
  return env.SLM_WORKER_ID || `${os.hostname()}-${process.pid}`;
}

function getSemanticConsumerConfig(env = process.env) {
  const slmTimeoutMs = positiveInteger(env.SLM_TIMEOUT_MS, 30000);
  const retries = Math.max(0, Number(env.SLM_BATCH_MAX_RETRIES || 2));
  const minimumSession = slmTimeoutMs * (retries + 1) + 30000;
  return {
    groupId: env.SEMANTIC_CONNECTOR_GROUP_ID || "saref4ener-semantic-connector",
    sessionTimeout: Math.max(
      positiveInteger(env.SEMANTIC_KAFKA_SESSION_TIMEOUT_MS, 180000),
      minimumSession
    ),
    heartbeatInterval: positiveInteger(env.SEMANTIC_KAFKA_HEARTBEAT_MS, 3000),
    maxWaitTimeInMs: positiveInteger(env.SLM_BATCH_MAX_WAIT_MS, 20),
    maxBytesPerPartition: positiveInteger(env.SEMANTIC_KAFKA_MAX_BYTES_PER_PARTITION, 1048576)
  };
}

function buildKafkaMetadata(topic, partition, message) {
  return {
    topic,
    partition,
    offset: message.offset === undefined ? null : Number(message.offset)
  };
}

function fallbackReadingId(event, metadata) {
  const identity = [
    metadata.topic,
    metadata.partition,
    metadata.offset,
    event.event_time,
    event.device_id,
    event.reading_name
  ].join(":");
  return `reading_${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

function buildSemanticMessageKey(event) {
  return [event.community_id, event.household_id, event.device_id].join("/");
}

function resolveDurableOffsets(offsets, resolveOffset) {
  for (const offset of offsets) resolveOffset(String(offset));
  const lastOffset = offsets.at(-1);
  return lastOffset === undefined || lastOffset === null ? null : String(lastOffset + 1);
}

async function publishJson(producer, topic, payload, key) {
  if (!producer || typeof producer.send !== "function") return;
  await producer.send({
    topic,
    messages: [{
      key: key || payload.reading_id || payload.correlation_id || null,
      value: JSON.stringify(payload),
      headers: payload.correlation_id ? { correlation_id: payload.correlation_id } : undefined
    }]
  });
}

async function publishSemanticEvent(producer, topic, semanticEvent) {
  return publishJson(producer, topic, semanticEvent, buildSemanticMessageKey(semanticEvent));
}

function parseNormalizedMessage(topic, partition, message) {
  const metadata = buildKafkaMetadata(topic, partition, message);
  const raw = message.value ? message.value.toString("utf8") : "";
  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    return { valid: false, metadata, raw, errors: [`invalid_json:${error.message}`] };
  }
  const validation = validateNormalizedTelemetryEvent(event);
  if (!validation.valid) return { valid: false, metadata, raw, event, errors: validation.errors };
  const reading = {
    ...event,
    reading_id: event.reading_id || fallbackReadingId(event, metadata),
    _kafka: metadata,
    _queued_at: new Date().toISOString()
  };
  return { valid: true, metadata, reading };
}

function batchMetricRecord(result, provider, timings) {
  const attemptCount = Math.max(...result.outcomes.map((outcome) => outcome.slmAttemptCount), 0);
  const inferenceLatency = Math.max(...result.outcomes.map((outcome) => outcome.slmInferenceLatencyMs), 0);
  return {
    event_time: new Date().toISOString(),
    slm_batch_id: result.batchId,
    slm_worker_id: result.workerId,
    slm_provider: provider.name,
    slm_model: provider.model,
    inference_server_identity: provider.serverIdentity,
    input_readings: result.inputCount,
    mapped_readings: result.mappedCount,
    safely_unmapped_readings: result.safelyUnmappedCount,
    attempt_count: attemptCount,
    queue_time_ms: timings.queueTimeMs,
    inference_latency_ms: inferenceLatency,
    database_latency_ms: timings.databaseLatencyMs,
    total_latency_ms: timings.totalLatencyMs,
    status: result.safelyUnmappedCount === 0 ? "completed" : "completed_with_unmapped",
    metrics_payload: {
      readings_per_batch: result.inputCount,
      no_real_execution: true
    }
  };
}

async function persistMappedOutcome({ outcome, pool, producer, semanticTopic, dlqTopic }) {
  const processedAt = new Date().toISOString();
  const mapping = buildMappingFromOutcome(outcome);
  const audit = buildSlmAuditRecord(outcome, processedAt);
  let semanticEvent = null;
  if (mapping) {
    const payload = buildSemanticPayload(outcome.reading, mapping);
    semanticEvent = buildSemanticEvent(outcome.reading, mapping, payload, processedAt);
  }
  const persisted = await insertSemanticOutcome(pool, semanticEvent, audit);
  if (semanticEvent && persisted.semanticInserted) {
    await publishSemanticEvent(producer, semanticTopic, semanticEvent);
  }
  if (outcome.safelyUnmapped && persisted.auditInserted) {
    await publishJson(producer, dlqTopic, {
      event_type: "semantic_reading_safely_unmapped",
      reading_id: outcome.reading.reading_id,
      correlation_id: outcome.reading.correlation_id || null,
      device_id: outcome.reading.device_id,
      household_id: outcome.reading.household_id,
      reading_name: outcome.reading.reading_name,
      final_status: outcome.finalStatus,
      reason: outcome.validationFailureReason,
      slm_called: true,
      slm_attempt_count: outcome.slmAttemptCount,
      no_real_execution: true
    });
  }
  return { semanticEvent, audit, persisted };
}

async function processReadingBatch({
  readings,
  provider,
  batchConfig,
  workerId,
  pool,
  producer,
  semanticTopic = SEMANTIC_ENRICHED_TOPIC,
  retryTopic = SEMANTIC_RETRY_TOPIC,
  dlqTopic = SEMANTIC_DLQ_TOPIC,
  heartbeat
}) {
  const started = performance.now();
  const earliestQueue = Math.min(...readings.map((reading) => Date.parse(reading._queued_at || new Date())));
  const result = await mapReadingBatch(readings, provider, batchConfig, {
    workerId,
    onRetry: async (retry) => {
      await publishJson(producer, retryTopic, {
        event_type: "semantic_batch_retry",
        slm_batch_id: retry.batchId,
        slm_request_id: retry.requestId,
        slm_attempt: retry.attempt,
        reading_ids: retry.readings.map((reading) => reading.reading_id),
        reasons: retry.reasons,
        slm_provider: provider.name,
        slm_model: provider.model
      }, retry.batchId);
      if (heartbeat) await heartbeat();
    }
  });

  const databaseStarted = performance.now();
  const persisted = [];
  for (const outcome of result.outcomes) {
    persisted.push(await persistMappedOutcome({
      outcome,
      pool,
      producer,
      semanticTopic,
      dlqTopic
    }));
  }
  const databaseLatencyMs = performance.now() - databaseStarted;
  const totalLatencyMs = performance.now() - started;
  await insertBatchMetrics(pool, batchMetricRecord(result, provider, {
    queueTimeMs: Math.max(0, Date.now() - earliestQueue),
    databaseLatencyMs,
    totalLatencyMs
  }));
  if (heartbeat) await heartbeat();
  return { ...result, persisted };
}

async function processNormalizedTelemetryMessages({
  topic,
  partition,
  messages,
  pool,
  producer,
  provider,
  batchConfig = getBatchConfig(),
  workerId = getWorkerId(),
  heartbeat
}) {
  const parsed = messages.map((message) => ({ message, result: parseNormalizedMessage(topic, partition, message) }));
  const valid = parsed.filter((entry) => entry.result.valid);
  const invalid = parsed.filter((entry) => !entry.result.valid);
  for (const entry of invalid) {
    await publishJson(producer, SEMANTIC_DLQ_TOPIC, {
      event_type: "invalid_normalized_message",
      source_topic: topic,
      source_partition: partition,
      source_offset: entry.result.metadata.offset,
      errors: entry.result.errors,
      request_hash: crypto.createHash("sha256").update(entry.result.raw || "").digest("hex")
    }, `${topic}:${partition}:${entry.result.metadata.offset}`);
  }

  const results = [];
  for (const readings of splitReadingBatches(valid.map((entry) => entry.result.reading), batchConfig)) {
    results.push(await processReadingBatch({
      readings,
      provider,
      batchConfig,
      workerId,
      pool,
      producer,
      heartbeat
    }));
  }
  return {
    results,
    validCount: valid.length,
    invalidCount: invalid.length,
    processedOffsets: parsed.map((entry) => entry.result.metadata.offset)
  };
}

async function resolveSemanticMapping(event, options = {}) {
  const provider = options.provider || createInferenceProvider(
    options.providerConfig || getProviderConfig(options.env || process.env),
    options.dependencies
  );
  const reading = {
    ...event,
    reading_id: event.reading_id || fallbackReadingId(event, { topic: "direct", partition: 0, offset: 0 }),
    _queued_at: new Date().toISOString()
  };
  const result = await mapReadingBatch([reading], provider, options.batchConfig || getBatchConfig(options.env), {
    workerId: options.workerId || "direct-test-worker"
  });
  const outcome = result.outcomes[0];
  return buildMappingFromOutcome(outcome) || {
    mapping_source: "unmapped",
    slm_called: true,
    slm_provider: outcome.slmProvider,
    slm_model: outcome.slmModel,
    slm_confidence: null,
    fallback_reason: outcome.validationFailureReason,
    final_status: outcome.finalStatus,
    safely_unmapped: true
  };
}

async function processNormalizedTelemetryMessage(options) {
  const provider = options.provider || createInferenceProvider(
    options.providerConfig || getProviderConfig(options.env || process.env),
    options.dependencies
  );
  const processed = await processNormalizedTelemetryMessages({
    ...options,
    messages: [options.message],
    provider
  });
  const first = processed.results[0]?.outcomes[0];
  return first
    ? {
        status: first.safelyUnmapped ? "safely_unmapped" : "processed",
        mapping_source: first.mappingSource,
        slm_confidence: first.slmConfidence,
        fallback_reason: first.validationFailureReason
      }
    : { status: "error", error: "invalid_normalized_message" };
}

async function start() {
  if (String(process.env.SLM_ENABLED || "true").toLowerCase() === "false") {
    throw new Error("SLM_ENABLED=false is not permitted for the mandatory SLM semantic path.");
  }
  const kafka = new Kafka({ clientId: KAFKA_CLIENT_ID, brokers: KAFKA_BROKERS });
  const consumerConfig = getSemanticConsumerConfig();
  const consumer = kafka.consumer(consumerConfig);
  const producer = kafka.producer({ allowAutoTopicCreation: true });
  const pool = createPool();
  const providerConfig = getProviderConfig();
  const provider = createInferenceProvider(providerConfig);
  const batchConfig = getBatchConfig();
  const workerId = getWorkerId();

  await ensureSemanticEventsTable(pool);
  await producer.connect();
  await consumer.connect();
  const health = await provider.healthCheck();
  console.log(`SLM provider health: ${JSON.stringify(health)}`);
  if (providerConfig.warmUpEnabled && health.ok) {
    try {
      await provider.warmUp();
      console.log(`SLM provider ${provider.name}/${provider.model} warm-up completed.`);
    } catch (error) {
      console.warn(`SLM warm-up failed; readings will be retried and safely unmapped if needed: ${error.message}`);
    }
  }
  await consumer.subscribe({
    topic: NORMALIZED_TELEMETRY_TOPIC,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    partitionsConsumedConcurrently: positiveInteger(process.env.SEMANTIC_PARTITIONS_CONCURRENTLY, 2),
    eachBatch: async ({ batch, heartbeat, isRunning, isStale, resolveOffset }) => {
      if (!isRunning() || isStale()) return;
      const heartbeatTimer = setInterval(() => heartbeat().catch(() => {}), consumerConfig.heartbeatInterval);
      if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
      try {
        const processed = await processNormalizedTelemetryMessages({
          topic: batch.topic,
          partition: batch.partition,
          messages: batch.messages,
          pool,
          producer,
          provider,
          batchConfig,
          workerId,
          heartbeat
        });
        const commitOffset = resolveDurableOffsets(processed.processedOffsets, resolveOffset);
        if (commitOffset !== null) {
          await consumer.commitOffsets([{
            topic: batch.topic,
            partition: batch.partition,
            offset: commitOffset
          }]);
        }
        console.log(JSON.stringify({
          event: "semantic_kafka_batch_completed",
          worker_id: workerId,
          topic: batch.topic,
          partition: batch.partition,
          valid_readings: processed.validCount,
          invalid_messages: processed.invalidCount,
          slm_batches: processed.results.length
        }));
      } finally {
        clearInterval(heartbeatTimer);
      }
    }
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Shutting down semantic worker ${workerId}...`);
    await consumer.stop().catch(() => {});
    await consumer.disconnect().catch(() => {});
    await producer.disconnect().catch(() => {});
    await pool.end().catch(() => {});
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Semantic connector failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  batchMetricRecord,
  buildKafkaMetadata,
  buildSemanticMessageKey,
  fallbackReadingId,
  getSemanticConsumerConfig,
  getWorkerId,
  parseNormalizedMessage,
  persistMappedOutcome,
  processNormalizedTelemetryMessage,
  processNormalizedTelemetryMessages,
  processReadingBatch,
  publishJson,
  publishSemanticEvent,
  resolveSemanticMapping,
  resolveDurableOffsets,
  start
};
