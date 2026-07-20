"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { OllamaProvider, VllmProvider, getProviderConfig } = require("../src/providers");
const { CircuitBreaker } = require("../src/providers/provider-interface");

const reading = [{
  reading_id: "provider-reading",
  device_type: "shelly_plug",
  reading_name: "active_power_kw",
  reading_value: 1,
  reading_unit: "kW"
}];

test("Ollama provider contract uses local generate endpoint and temperature zero", async () => {
  let request;
  const provider = new OllamaProvider({ endpoint: "http://ollama:11434", model: "phi3:mini" }, {
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ response: '{"mappings":[]}' }) };
    }
  });
  const result = await provider.inferBatch(reading, { requestId: "request-1" });
  assert.equal(request.url, "http://ollama:11434/api/generate");
  assert.equal(request.body.options.temperature, 0);
  assert.equal(result.requestId, "request-1");
  assert.equal(result.provider, "ollama");
});

test("vLLM provider contract uses OpenAI-compatible structured output", async () => {
  let request;
  const provider = new VllmProvider({ endpoint: "http://vllm:8000", model: "phi3-local" }, {
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"mappings":[]}' } }],
          usage: { total_tokens: 10 }
        })
      };
    }
  });
  const result = await provider.inferBatch(reading, { requestId: "request-2" });
  assert.equal(request.url, "http://vllm:8000/v1/chat/completions");
  assert.equal(request.body.temperature, 0);
  assert.equal(request.body.response_format.type, "json_schema");
  assert.equal(result.provider, "vllm");
});

test("provider selection is environment driven and contains no paid provider", () => {
  assert.equal(getProviderConfig({ SLM_PROVIDER: "ollama" }).provider, "ollama");
  assert.equal(getProviderConfig({ SLM_PROVIDER: "vllm" }).provider, "vllm");
  assert.throws(() => getProviderConfig({ SLM_PROVIDER: "cloud-paid" }), /Unsupported/);
});

test("an open circuit cools down and permits a real provider probe", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 20 });
  breaker.failure();
  const started = Date.now();
  await breaker.waitUntilAvailable();
  assert.ok(Date.now() - started >= 15);
  assert.equal(breaker.state(), "closed");
});
