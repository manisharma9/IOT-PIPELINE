"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  processNormalizedTelemetryMessage,
  resolveSemanticMapping
} = require("../src/index");

function normalizedEvent(overrides = {}) {
  return {
    event_time: "2026-05-24T18:00:00.000Z",
    household_id: "household-unknown",
    community_id: "community-dublin-north",
    device_id: "meter-unknown",
    device_type: "smart_meter",
    reading_name: "grid_stress_index",
    reading_value: 0.82,
    reading_unit: "score",
    protocol: "http",
    source: "manual-phase-3-test",
    correlation_id: "raw.telemetry:0:5",
    ...overrides
  };
}

function validSlmOutput(overrides = {}) {
  return {
    saref_type: "saref:Measurement",
    saref_property: "saref:Property",
    saref_unit: "unit:UNITLESS",
    saref4ener_concept: "saref4ener:GridConditionIndicator",
    ngsi_type: "Property",
    ngsi_property: "gridStressIndex",
    mapping_confidence: "low",
    explanation: "Unknown grid stress score is mapped as a grid condition indicator.",
    ...overrides
  };
}

function kafkaMessage(event) {
  return {
    offset: "5",
    value: Buffer.from(JSON.stringify(event))
  };
}

test("known reading still uses deterministic mapping and never calls SLM", async () => {
  let slmCalled = false;
  const mapping = await resolveSemanticMapping(
    normalizedEvent({
      reading_name: "active_power_kw",
      reading_value: 1.42,
      reading_unit: "kW"
    }),
    {
      slmEnabled: true,
      slmMapper: async () => {
        slmCalled = true;
        return validSlmOutput();
      }
    }
  );

  assert.equal(mapping.mapping_source, "deterministic");
  assert.equal(mapping.saref_property, "saref:Power");
  assert.equal(slmCalled, false);
});

test("unknown reading calls mocked SLM and accepts valid output", async () => {
  let slmCalled = false;
  const mapping = await resolveSemanticMapping(normalizedEvent(), {
    slmEnabled: true,
    slmMapper: async () => {
      slmCalled = true;
      return validSlmOutput();
    }
  });

  assert.equal(slmCalled, true);
  assert.equal(mapping.mapping_source, "slm_assisted");
  assert.equal(mapping.ngsi_property, "gridStressIndex");
});

test("invalid SLM output falls back safely to unmapped mapping", async () => {
  const mapping = await resolveSemanticMapping(normalizedEvent(), {
    slmEnabled: true,
    slmMapper: async () => ({
      mapping_confidence: "certain"
    })
  });

  assert.equal(mapping.mapping_source, "unmapped");
  assert.equal(mapping.mapping_confidence, "low");
  assert.equal(mapping.saref_property, "unmapped");
});

test("Ollama failure falls back safely to unmapped mapping", async () => {
  const mapping = await resolveSemanticMapping(normalizedEvent(), {
    slmEnabled: true,
    slmMapper: async () => {
      throw new Error("Ollama unavailable");
    }
  });

  assert.equal(mapping.mapping_source, "unmapped");
  assert.equal(mapping.mapping_confidence, "low");
});

test("slm_assisted semantic event is stored and published with mapping_source", async () => {
  const sentMessages = [];
  const pool = {
    query: async () => undefined
  };
  const producer = {
    send: async (message) => {
      sentMessages.push(message);
    }
  };

  const result = await processNormalizedTelemetryMessage({
    topic: "normalized.telemetry",
    partition: 0,
    message: kafkaMessage(normalizedEvent()),
    pool,
    producer,
    slmEnabled: true,
    slmMapper: async () => validSlmOutput()
  });

  const publishedEvent = JSON.parse(sentMessages[0].messages[0].value);

  assert.equal(result.status, "processed");
  assert.equal(result.mapping_source, "slm_assisted");
  assert.equal(publishedEvent.mapping_source, "slm_assisted");
  assert.equal(publishedEvent.semantic_payload.mapping_source, "slm_assisted");
  assert.equal(publishedEvent.semantic_payload.original_reading.reading_name, "grid_stress_index");
});

test("fallback semantic event keeps mapping_source as unmapped", async () => {
  const sentMessages = [];
  const pool = {
    query: async () => undefined
  };
  const producer = {
    send: async (message) => {
      sentMessages.push(message);
    }
  };

  const result = await processNormalizedTelemetryMessage({
    topic: "normalized.telemetry",
    partition: 0,
    message: kafkaMessage(normalizedEvent()),
    pool,
    producer,
    slmEnabled: true,
    slmMapper: async () => null
  });

  const publishedEvent = JSON.parse(sentMessages[0].messages[0].value);

  assert.equal(result.status, "processed");
  assert.equal(result.mapping_source, "unmapped");
  assert.equal(publishedEvent.mapping_source, "unmapped");
  assert.equal(publishedEvent.semantic_payload.mapping_source, "unmapped");
});
