"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildSlmPrompt,
  getSlmConfig,
  suggestSlmMapping
} = require("../src/slm-mapper");

function normalizedEvent(overrides = {}) {
  return {
    event_time: "2026-05-24T18:00:00.000Z",
    household_id: "household-unknown",
    community_id: "community-dublin-north",
    device_id: "meter-unknown",
    device_type: "smart_meter",
    reading_name: "roomHeat",
    reading_value: 24.7,
    reading_unit: "C",
    protocol: "http",
    source: "manual-phase-3-test",
    correlation_id: "raw.telemetry:0:5",
    ...overrides
  };
}

function validSlmOutput() {
  return {
    saref_type: "saref:Measurement",
    saref_property: "saref:Temperature",
    saref_unit: "unit:DEG_C",
    saref4ener_concept: "saref4ener:TemperatureMeasurement",
    ngsi_type: "Property",
    ngsi_property: "temperature",
    mapping_confidence: "medium",
    explanation: "Unknown roomHeat is treated as an indoor temperature reading."
  };
}

test("SLM prompt asks for JSON-only mapping output", () => {
  const prompt = buildSlmPrompt(normalizedEvent());

  assert.match(prompt, /Return JSON only/);
  assert.match(prompt, /mapping_confidence/);
  assert.match(prompt, /roomHeat/);
});

test("SLM mapper accepts valid Ollama JSON response", async () => {
  const calls = [];
  const fetchImpl = async (url, request) => {
    calls.push({ url, request });
    return {
      ok: true,
      json: async () => ({
        response: JSON.stringify(validSlmOutput())
      })
    };
  };

  const output = await suggestSlmMapping(normalizedEvent(), {
    env: {
      SLM_ENABLED: "true",
      OLLAMA_BASE_URL: "http://ollama.test:11434",
      OLLAMA_MODEL: "phi3:mini",
      SLM_TIMEOUT_MS: "1000"
    },
    fetchImpl
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://ollama.test:11434/api/generate");
  assert.equal(JSON.parse(calls[0].request.body).model, "phi3:mini");
  assert.equal(JSON.parse(calls[0].request.body).format, "json");
  assert.equal(output.saref_property, "saref:Temperature");
});

test("SLM mapper rejects invalid Ollama JSON response", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      response: "not json"
    })
  });

  const output = await suggestSlmMapping(normalizedEvent(), {
    config: {
      ...getSlmConfig({ SLM_ENABLED: "true" }),
      enabled: true
    },
    fetchImpl
  });

  assert.equal(output, null);
});

test("SLM mapper returns null when Ollama is unavailable", async () => {
  const output = await suggestSlmMapping(normalizedEvent(), {
    config: {
      ...getSlmConfig({ SLM_ENABLED: "true" }),
      enabled: true
    },
    fetchImpl: async () => {
      throw new Error("connection refused");
    }
  });

  assert.equal(output, null);
});

test("SLM mapper does not call Ollama when disabled", async () => {
  let called = false;
  const output = await suggestSlmMapping(normalizedEvent(), {
    env: {
      SLM_ENABLED: "false"
    },
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({ response: "{}" }) };
    }
  });

  assert.equal(output, null);
  assert.equal(called, false);
});
