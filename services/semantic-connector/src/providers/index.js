"use strict";

const { OllamaProvider } = require("./ollama-provider");
const { VllmProvider } = require("./vllm-provider");

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(String(value).trim().toLowerCase());
}

function integerValue(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getProviderConfig(env = process.env) {
  const provider = String(env.SLM_PROVIDER || "ollama").trim().toLowerCase();
  const shared = {
    timeoutMs: integerValue(env.SLM_TIMEOUT_MS, 30000),
    maxOutputTokens: integerValue(env.SLM_MAX_OUTPUT_TOKENS, 8192),
    maxConcurrency: integerValue(env.SLM_PROVIDER_MAX_CONCURRENCY, provider === "ollama" ? 1 : 8),
    circuitFailureThreshold: integerValue(env.SLM_CIRCUIT_FAILURE_THRESHOLD, 5),
    circuitCooldownMs: integerValue(env.SLM_CIRCUIT_COOLDOWN_MS, 30000)
  };

  if (provider === "vllm") {
    return {
      ...shared,
      provider,
      endpoint: env.VLLM_BASE_URL || "http://localhost:8000",
      model: env.VLLM_MODEL || env.SLM_MODEL || "microsoft/Phi-3-mini-4k-instruct",
      apiKey: env.VLLM_API_KEY || "",
      warmUpEnabled: booleanValue(env.SLM_WARMUP_ENABLED, true)
    };
  }
  if (provider !== "ollama") throw new Error(`Unsupported SLM_PROVIDER: ${provider}`);
  return {
    ...shared,
    provider,
    endpoint: env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: env.SLM_MODEL || env.OLLAMA_MODEL || "phi3:mini",
    warmUpEnabled: booleanValue(env.SLM_WARMUP_ENABLED, true)
  };
}

function createInferenceProvider(config = getProviderConfig(), dependencies = {}) {
  if (config.provider === "vllm") return new VllmProvider(config, dependencies);
  return new OllamaProvider(config, dependencies);
}

module.exports = {
  booleanValue,
  createInferenceProvider,
  getProviderConfig,
  integerValue,
  OllamaProvider,
  VllmProvider
};
