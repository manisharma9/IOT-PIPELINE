"use strict";

const { estimateBatchTokens } = require("./providers/prompt");

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getBatchConfig(env = process.env) {
  return {
    maxReadings: positiveInteger(env.SLM_BATCH_MAX_READINGS, 128),
    maxWaitMs: positiveInteger(env.SLM_BATCH_MAX_WAIT_MS, 20),
    maxPromptTokens: positiveInteger(env.SLM_BATCH_MAX_PROMPT_TOKENS, 4096),
    maxRetries: Math.max(0, Number.isInteger(Number(env.SLM_BATCH_MAX_RETRIES))
      ? Number(env.SLM_BATCH_MAX_RETRIES)
      : 2),
    minConfidence: (() => {
      const numeric = Number(env.SLM_MIN_CONFIDENCE);
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) return numeric;
      const named = String(env.SLM_MIN_CONFIDENCE || "").toLowerCase();
      return named === "high" ? 0.85 : named === "low" ? 0.5 : 0.7;
    })()
  };
}

function splitReadingBatches(readings, config = getBatchConfig()) {
  const batches = [];
  let current = [];
  for (const reading of readings) {
    const candidate = [...current, reading];
    if (
      current.length > 0 &&
      (candidate.length > config.maxReadings || estimateBatchTokens(candidate) > config.maxPromptTokens)
    ) {
      batches.push(current);
      current = [reading];
    } else {
      current = candidate;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

module.exports = {
  getBatchConfig,
  positiveInteger,
  splitReadingBatches
};
