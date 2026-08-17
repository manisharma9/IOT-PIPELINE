"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { CircuitBreaker, ConcurrencyLimiter, InferenceProvider } = require("../provider-interface");
const { buildBatchPrompt, buildResponseSchema } = require("../prompt");

class OllamaProvider extends InferenceProvider {
  constructor(config = {}, dependencies = {}) {
    super({
      name: "ollama",
      model: config.model || "phi3:mini",
      endpoint: config.endpoint || "http://localhost:11434",
      serverIdentity: config.serverIdentity
    });
    this.timeoutMs = Number(config.timeoutMs || 30000);
    this.maxOutputTokens = Number(config.maxOutputTokens || 8192);
    this.fetch = dependencies.fetchImpl || globalThis.fetch;
    this.limiter = new ConcurrencyLimiter(config.maxConcurrency || 1);
    this.breaker = new CircuitBreaker({
      failureThreshold: config.circuitFailureThreshold || 5,
      cooldownMs: config.circuitCooldownMs || 30000
    });
  }

  async healthCheck() {
    try {
      const response = await this.fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) return { ok: false, provider: this.name, model: this.model };
      const body = await response.json();
      const models = (body.models || []).map((item) => item.name || item.model);
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
    }], { requestId: "ollama_warmup" });
  }

  async inferBatch(readings, options = {}) {
    return this.limiter.run(async () => {
      await this.breaker.waitUntilAvailable();
      const requestId = options.requestId || `ollama_${crypto.randomUUID()}`;
      const startedAt = new Date();
      const started = performance.now();
      try {
        const response = await this.fetch(`${this.endpoint}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            messages: [
              {
                role: "system",
                content: "You are a strict energy telemetry semantic classifier. Return only the requested JSON."
              },
              {
                role: "user",
                content: buildBatchPrompt(readings, {
                  validationHints: options.validationHints
                })
              }
            ],
            format: buildResponseSchema(readings),
            stream: false,
            options: {
              temperature: 0,
              num_predict: this.maxOutputTokens
            }
          }),
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        if (!response.ok) throw new Error(`ollama_http_${response.status}`);
        const body = await response.json();
        const rawOutput = body?.message?.content;
        if (typeof rawOutput !== "string") throw new Error("ollama_response_missing_output");
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
          usage: {
            prompt_tokens: body.prompt_eval_count || null,
            completion_tokens: body.eval_count || null
          }
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

module.exports = { OllamaProvider };
