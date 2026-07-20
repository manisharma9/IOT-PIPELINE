"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getSemanticConsumerConfig,
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
    mapping_confidence: "medium",
    explanation: "Unknown grid stress score is mapped as a grid condition indicator.",
    ...overrides
  };
}

function validPowerSlmOutput(overrides = {}) {
  return {
    saref_type: "saref:Measurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    saref4ener_concept: "saref4ener:PowerMeasurement",
    ngsi_type: "Property",
    ngsi_property: "activePower",
    mapping_confidence: "high",
    explanation: "Active power in kW is an electrical power measurement.",
    ...overrides
  };
}

function kafkaMessage(event) {
  return {
    offset: "5",
    value: Buffer.from(JSON.stringify(event))
  };
}

test("semantic consumer session remains longer than the local SLM timeout", () => {
  const config = getSemanticConsumerConfig({
    SEMANTIC_CONNECTOR_GROUP_ID: "test-semantic-group",
    SLM_TIMEOUT_MS: "30000",
    SEMANTIC_KAFKA_SESSION_TIMEOUT_MS: "120000"
  });

  assert.equal(config.groupId, "test-semantic-group");
  assert.equal(config.sessionTimeout, 120000);
  assert.equal(config.heartbeatInterval, 3000);
});

test("semantic consumer protects against an undersized session timeout", () => {
  const config = getSemanticConsumerConfig({
    SLM_TIMEOUT_MS: "45000",
    SEMANTIC_KAFKA_SESSION_TIMEOUT_MS: "10000"
  });

  assert.equal(config.sessionTimeout, 75000);
});

test("known reading uses SLM primary path and deterministic validation", async () => {
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
        return validPowerSlmOutput();
      }
    }
  );

  assert.equal(mapping.mapping_source, "slm_primary");
  assert.equal(mapping.saref_property, "saref:Power");
  assert.equal(mapping.validation_source, "deterministic_validation");
  assert.equal(mapping.deterministic_validation, "passed");
  assert.equal(slmCalled, true);
});

test("Ollama available SLM primary path succeeds for known telemetry", async () => {
  const mapping = await resolveSemanticMapping(
    normalizedEvent({
      reading_name: "active_power_kw",
      reading_value: 1.42,
      reading_unit: "kW"
    }),
    {
      slmEnabled: true,
      slmPrimary: true,
      slmModel: "phi3:mini",
      slmMapper: async () => validPowerSlmOutput()
    }
  );

  assert.equal(mapping.mapping_source, "slm_primary");
  assert.equal(mapping.slm_called, true);
  assert.equal(mapping.slm_model, "phi3:mini");
  assert.equal(mapping.slm_confidence, "high");
  assert.equal(mapping.deterministic_validation, "passed");
  assert.equal(mapping.fallback_reason, null);
});

test("unknown reading uses SLM primary path when output passes guardrails", async () => {
  let slmCalled = false;
  const mapping = await resolveSemanticMapping(normalizedEvent(), {
    slmEnabled: true,
    slmMapper: async () => {
      slmCalled = true;
      return validSlmOutput();
    }
  });

  assert.equal(slmCalled, true);
  assert.equal(mapping.mapping_source, "slm_primary");
  assert.equal(mapping.ngsi_property, "gridStressIndex");
  assert.equal(mapping.validation_source, "slm_guardrails");
});

test("invalid SLM output falls back safely to deterministic mapping when available", async () => {
  const mapping = await resolveSemanticMapping(normalizedEvent({
    reading_name: "active_power_kw",
    reading_value: 1.42,
    reading_unit: "kW"
  }), {
    slmEnabled: true,
    slmMapper: async () => ({
      mapping_confidence: "certain"
    })
  });

  assert.equal(mapping.mapping_source, "deterministic_fallback");
  assert.equal(mapping.mapping_confidence, "high");
  assert.equal(mapping.saref_property, "saref:Power");
  assert.match(mapping.fallback_reason, /slm_rejected/);
});

test("low confidence SLM output falls back safely to deterministic mapping", async () => {
  const mapping = await resolveSemanticMapping(normalizedEvent({
    reading_name: "active_power_kw",
    reading_value: 1.42,
    reading_unit: "kW"
  }), {
    slmEnabled: true,
    slmMapper: async () => validPowerSlmOutput({ mapping_confidence: "low" })
  });

  assert.equal(mapping.mapping_source, "deterministic_fallback");
  assert.equal(mapping.saref_property, "saref:Power");
  assert.match(mapping.fallback_reason, /below minimum/);
});

test("Ollama failure falls back safely to deterministic mapping when available", async () => {
  const mapping = await resolveSemanticMapping(normalizedEvent({
    reading_name: "active_power_kw",
    reading_value: 1.42,
    reading_unit: "kW"
  }), {
    slmEnabled: true,
    slmMapper: async () => {
      throw new Error("Ollama unavailable");
    }
  });

  assert.equal(mapping.mapping_source, "deterministic_fallback");
  assert.equal(mapping.mapping_confidence, "high");
  assert.equal(mapping.fallback_reason, "slm_mapper_error");
});

test("deterministic validation catches SLM unit or concept mismatch", async () => {
  const mapping = await resolveSemanticMapping(normalizedEvent({
    reading_name: "active_power_kw",
    reading_value: 1.42,
    reading_unit: "kW"
  }), {
    slmEnabled: true,
    slmMapper: async () => validPowerSlmOutput({
      saref_unit: "unit:V",
      saref4ener_concept: "saref4ener:VoltageMeasurement"
    })
  });

  assert.equal(mapping.mapping_source, "deterministic_fallback");
  assert.equal(mapping.saref_property, "saref:Power");
  assert.match(mapping.fallback_reason, /deterministic SAREF4ENER validation/);
});

test("slm_primary semantic event is stored and published with mapping_source and audit fields", async () => {
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
  assert.equal(result.mapping_source, "slm_primary");
  assert.equal(result.slm_confidence, "medium");
  assert.equal(publishedEvent.mapping_source, "slm_primary");
  assert.equal(publishedEvent.semantic_payload.mapping_source, "slm_primary");
  assert.equal(publishedEvent.semantic_payload.slm_audit.slm_called, true);
  assert.equal(publishedEvent.semantic_payload.slm_audit.slm_model, "phi3:mini");
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
  assert.equal(result.fallback_reason, "slm_unavailable");
  assert.equal(publishedEvent.mapping_source, "unmapped");
  assert.equal(publishedEvent.semantic_payload.mapping_source, "unmapped");
  assert.equal(publishedEvent.semantic_payload.slm_audit.fallback_reason, "slm_unavailable");
});
