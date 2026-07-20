"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fallbackReadingId,
  getSemanticConsumerConfig,
  parseNormalizedMessage,
  resolveDurableOffsets,
  resolveSemanticMapping
} = require("../src/index");

function normalizedEvent(overrides = {}) {
  return {
    reading_id: "reading-test-001",
    event_time: "2026-07-20T12:00:00.000Z",
    household_id: "household-001",
    community_id: "community-dublin-north",
    device_id: "shelly-plug-001",
    device_type: "shelly_plug",
    reading_name: "active_power_kw",
    reading_value: 1.2,
    reading_unit: "kW",
    protocol: "http",
    source: "test",
    correlation_id: "test-correlation",
    ...overrides
  };
}

function strictMapping(reading, overrides = {}) {
  return {
    reading_id: reading.reading_id,
    saref_concept: "saref4ener:PowerMeasurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    confidence: 0.96,
    mapping_reason_code: "exact_field_unit_match",
    ...overrides
  };
}

function mockProvider(handler) {
  return {
    name: "mock",
    model: "phi3-test",
    serverIdentity: "mock-inference-1",
    inferBatch: async (readings, options) => ({
      requestId: options.requestId,
      provider: "mock",
      model: "phi3-test",
      serverIdentity: "mock-inference-1",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      latencyMs: 5,
      rawOutput: handler(readings)
    })
  };
}

test("consumer session timeout covers all configured SLM attempts", () => {
  const config = getSemanticConsumerConfig({
    SLM_TIMEOUT_MS: "30000",
    SLM_BATCH_MAX_RETRIES: "2",
    SEMANTIC_KAFKA_SESSION_TIMEOUT_MS: "60000"
  });
  assert.equal(config.sessionTimeout, 120000);
  assert.equal(config.maxWaitTimeInMs, 20);
});

test("valid normalized message retains supplied reading identity", () => {
  const event = normalizedEvent();
  const result = parseNormalizedMessage("normalized.telemetry", 2, {
    offset: "15",
    value: Buffer.from(JSON.stringify(event))
  });
  assert.equal(result.valid, true);
  assert.equal(result.reading.reading_id, event.reading_id);
  assert.equal(result.reading._kafka.partition, 2);
});

test("legacy normalized message receives stable reading identity", () => {
  const event = normalizedEvent({ reading_id: undefined });
  const metadata = { topic: "normalized.telemetry", partition: 0, offset: 9 };
  assert.equal(fallbackReadingId(event, metadata), fallbackReadingId(event, metadata));
  assert.match(fallbackReadingId(event, metadata), /^reading_[a-f0-9]{64}$/);
});

test("durable offsets are resolved before the next offset is committed", () => {
  const resolved = [];
  const commitOffset = resolveDurableOffsets([17, 18, 19], (offset) => resolved.push(offset));
  assert.deepEqual(resolved, ["17", "18", "19"]);
  assert.equal(commitOffset, "20");
  assert.equal(resolveDurableOffsets([], () => {}), null);
});

test("known reading uses mandatory SLM result and deterministic validation", async () => {
  const event = normalizedEvent();
  const mapping = await resolveSemanticMapping(event, {
    provider: mockProvider((readings) => JSON.stringify({
      mappings: readings.map((reading) => strictMapping(reading))
    })),
    batchConfig: { maxRetries: 0, minConfidence: 0.7 }
  });
  assert.equal(mapping.mapping_source, "slm_primary");
  assert.equal(mapping.slm_called, true);
  assert.equal(mapping.deterministic_validation.status, "passed");
});

test("provider failure is safely unmapped and never deterministic fallback", async () => {
  const provider = mockProvider(() => "{}");
  provider.inferBatch = async () => { throw new Error("ollama_unavailable"); };
  const mapping = await resolveSemanticMapping(normalizedEvent(), {
    provider,
    batchConfig: { maxRetries: 1, minConfidence: 0.7 }
  });
  assert.equal(mapping.mapping_source, "unmapped");
  assert.equal(mapping.safely_unmapped, true);
  assert.equal(mapping.slm_called, true);
  assert.notEqual(mapping.mapping_source, "deterministic_fallback");
});

test("invalid SLM unit for known telemetry is safely unmapped", async () => {
  const event = normalizedEvent();
  const mapping = await resolveSemanticMapping(event, {
    provider: mockProvider((readings) => JSON.stringify({
      mappings: readings.map((reading) => strictMapping(reading, { saref_unit: "unit:V" }))
    })),
    batchConfig: { maxRetries: 0, minConfidence: 0.7 }
  });
  assert.equal(mapping.mapping_source, "unmapped");
  assert.match(mapping.fallback_reason, /unit/);
});
