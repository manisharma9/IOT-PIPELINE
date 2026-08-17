"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { CircuitBreaker, ConcurrencyLimiter, InferenceProvider } = require("../provider-interface");
const { buildBatchPrompt, buildResponseSchema } = require("../prompt");

class VllmProvider extends InferenceProvider {
  constructor(config = {}, dependencies = {}) {
    super({
      name: "vllm",
      model: config.model || "microsoft/Phi-3-mini-4k-instruct",
      endpoint: config.endpoint || "http://localhost:8000",
      serverIdentity: config.serverIdentity
    });
    this.timeoutMs = Number(config.timeoutMs || 30000);
    this.maxOutputTokens = Number(config.maxOutputTokens || 8192);
    this.apiKey = config.apiKey || "";
    this.fetch = dependencies.fetchImpl || globalThis.fetch;
    this.limiter = new ConcurrencyLimiter(config.maxConcurrency || 8);
    this.breaker = new CircuitBreaker({
      failureThreshold: config.circuitFailureThreshold || 5,
      cooldownMs: config.circuitCooldownMs || 30000
    });
  }

  headers() {
    return {
      "content-type": "application/json",
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
    };
  }

  async healthCheck() {
    try {
      const response = await this.fetch(`${this.endpoint}/v1/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) return { ok: false, provider: this.name, model: this.model };
      const body = await response.json();
      const models = (body.data || []).map((item) => item.id);
      return { ok: models.includes(this.model), provider: this.name, model: this.model, models };
    } catch (error) {
      return { ok: false, provider: this.name, model: this.model, error: error.message };
    }
  }

  async warmUp() {
    return this.inferBatch([{
      reading_id: "warmup-reading",
      device_type: "smart_plug",
      reading_name: "active_power_kw",
      reading_value: 1,
      reading_unit: "kW"
    }], { requestId: "vllm_warmup" });
  }

  async inferBatch(readings, options = {}) {
    return this.limiter.run(async () => {
      await this.breaker.waitUntilAvailable();
      const requestId = options.requestId || `vllm_${crypto.randomUUID()}`;
      const startedAt = new Date();
      const started = performance.now();
      try {
        const response = await this.fetch(`${this.endpoint}/v1/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: this.model,
            messages: [{
              role: "user",
              content: buildBatchPrompt(readings, {
                validationHints: options.validationHints
              })
            }],
            temperature: 0,
            max_tokens: this.maxOutputTokens,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "adflex_semantic_batch",
                strict: true,
                schema: buildResponseSchema(readings)
              }
            }
          }),
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        if (!response.ok) throw new Error(`vllm_http_${response.status}`);
        const body = await response.json();
        const rawOutput = body?.choices?.[0]?.message?.content;
        if (typeof rawOutput !== "string") throw new Error("vllm_response_missing_output");
        this.breaker.success();
        return {
          requestId,
          provider: this.name,
          model: this.model,
          serverIdentity: this.serverIdentity,
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          latencyMs: performance.now() - started,
          rawOutput,
          usage: body.usage || null
        };
      } catch (error) {
        this.breaker.failure();
        error.requestId = requestId;
        error.provider = this.name;
        error.model = this.model;
        throw error;
      }
    });
  }
}

module.exports = { VllmProvider };
