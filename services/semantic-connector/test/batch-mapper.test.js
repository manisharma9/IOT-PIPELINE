"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { mapReadingBatch } = require("../src/batch-mapper");

const reading = {
  reading_id: "batch-reading-1",
  event_time: "2026-07-20T12:00:00Z",
  household_id: "household-1",
  device_id: "shelly-1",
  device_type: "shelly_plug",
  reading_name: "active_power_kw",
  reading_value: 1.1,
  reading_unit: "kW"
};

function output(confidence = 0.95) {
  return JSON.stringify({ mappings: [{
    reading_id: reading.reading_id,
    saref_concept: "saref4ener:PowerMeasurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    confidence,
    mapping_reason_code: "exact_field_unit_match"
  }] });
}

test("successful mandatory SLM result records complete evidence", async () => {
  const provider = {
    name: "ollama",
    model: "phi3:mini",
    serverIdentity: "local-ollama",
    inferBatch: async (_readings, options) => ({
      requestId: options.requestId,
      startedAt: "2026-07-20T12:00:01Z",
      completedAt: "2026-07-20T12:00:02Z",
      latencyMs: 1000,
      serverIdentity: "local-ollama",
      rawOutput: output()
    })
  };
  const result = await mapReadingBatch([reading], provider, { maxRetries: 2, minConfidence: 0.7 }, { workerId: "worker-1" });
  const outcome = result.outcomes[0];
  assert.equal(outcome.slmCalled, true);
  assert.equal(outcome.mappingSource, "slm_primary");
  assert.equal(outcome.slmAttemptCount, 1);
  assert.equal(outcome.slmWorkerId, "worker-1");
  assert.equal(outcome.safelyUnmapped, false);
});

test("invalid JSON retries then becomes explicit safely unmapped state", async () => {
  let calls = 0;
  const provider = {
    name: "ollama",
    model: "phi3:mini",
    serverIdentity: "local-ollama",
    inferBatch: async (_readings, options) => {
      calls += 1;
      return {
        requestId: options.requestId,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs: 1,
        rawOutput: "not json"
      };
    }
  };
  const retries = [];
  const result = await mapReadingBatch([reading], provider, { maxRetries: 2, minConfidence: 0.7 }, {
    workerId: "worker-1",
    onRetry: async (value) => retries.push(value)
  });
  assert.equal(calls, 3);
  assert.equal(retries.length, 2);
  assert.equal(result.outcomes[0].safelyUnmapped, true);
  assert.equal(result.outcomes[0].slmCalled, true);
  assert.equal(result.outcomes[0].mapping, null);
});

test("low confidence can recover on retry without deterministic replacement", async () => {
  let calls = 0;
  const provider = {
    name: "vllm",
    model: "phi3",
    serverIdentity: "vllm-1",
    inferBatch: async (_readings, options) => ({
      requestId: options.requestId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      latencyMs: 2,
      rawOutput: output(++calls === 1 ? 0.2 : 0.9)
    })
  };
  const result = await mapReadingBatch([reading], provider, { maxRetries: 1, minConfidence: 0.7 });
  assert.equal(result.outcomes[0].mappingSource, "slm_primary");
  assert.equal(result.outcomes[0].slmAttemptCount, 2);
});
