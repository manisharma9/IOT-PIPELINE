"use strict";

const crypto = require("node:crypto");
const { validateBatchResponse } = require("./slm-batch-validation");

function createBatchId(workerId = "semantic-worker") {
  return `${workerId}_batch_${crypto.randomUUID()}`;
}

function createInitialState(reading, batchId) {
  return {
    reading,
    batchId,
    slmCalled: true,
    attemptCount: 0,
    outputReceived: false,
    requestIds: [],
    inferenceStartedAt: null,
    inferenceCompletedAt: null,
    inferenceLatencyMs: 0,
    validationFailures: [],
    lastProviderError: null
  };
}

function toAcceptedOutcome(state, accepted, providerResult, provider) {
  return {
    reading: state.reading,
    mapping: accepted.mapping,
    mappingSource: "slm_primary",
    finalStatus: "mapped",
    safelyUnmapped: false,
    slmCalled: true,
    slmProvider: provider.name,
    slmModel: provider.model,
    slmWorkerId: null,
    slmBatchId: state.batchId,
    slmRequestId: providerResult.requestId,
    slmRequestIds: [...state.requestIds],
    slmAttemptCount: state.attemptCount,
    slmInferenceStartedAt: state.inferenceStartedAt,
    slmInferenceCompletedAt: state.inferenceCompletedAt,
    slmInferenceLatencyMs: state.inferenceLatencyMs,
    slmOutputReceived: state.outputReceived,
    slmConfidence: accepted.mapping.confidence,
    deterministicValidation: accepted.deterministicValidation,
    validationFailureReason: null,
    inferenceServerIdentity: providerResult.serverIdentity || provider.serverIdentity,
    usage: providerResult.usage || null
  };
}

function toUnmappedOutcome(state, provider) {
  const failures = [...new Set([
    ...state.validationFailures,
    ...(state.lastProviderError ? [state.lastProviderError] : [])
  ])];
  return {
    reading: state.reading,
    mapping: null,
    mappingSource: "unmapped",
    finalStatus: "safely_unmapped",
    safelyUnmapped: true,
    slmCalled: true,
    slmProvider: provider.name,
    slmModel: provider.model,
    slmWorkerId: null,
    slmBatchId: state.batchId,
    slmRequestId: state.requestIds.at(-1) || null,
    slmRequestIds: [...state.requestIds],
    slmAttemptCount: state.attemptCount,
    slmInferenceStartedAt: state.inferenceStartedAt,
    slmInferenceCompletedAt: state.inferenceCompletedAt,
    slmInferenceLatencyMs: state.inferenceLatencyMs,
    slmOutputReceived: state.outputReceived,
    slmConfidence: null,
    deterministicValidation: {
      status: "not_accepted",
      errors: failures
    },
    validationFailureReason: failures.join(";") || "slm_mapping_unavailable",
    inferenceServerIdentity: provider.serverIdentity,
    usage: null
  };
}

async function mapReadingBatch(readings, provider, config, options = {}) {
  const workerId = options.workerId || "semantic-worker";
  const batchId = options.batchId || createBatchId(workerId);
  const states = new Map(readings.map((reading) => [reading.reading_id, createInitialState(reading, batchId)]));
  const acceptedOutcomes = new Map();
  let pending = [...readings];

  for (let attempt = 1; attempt <= config.maxRetries + 1 && pending.length; attempt += 1) {
    const requestId = `${batchId}_attempt_${attempt}_${crypto.randomUUID()}`;
    const attemptStartedAt = new Date().toISOString();
    for (const reading of pending) {
      const state = states.get(reading.reading_id);
      state.attemptCount += 1;
      state.requestIds.push(requestId);
      if (!state.inferenceStartedAt) state.inferenceStartedAt = attemptStartedAt;
    }

    let providerResult;
    try {
      providerResult = await provider.inferBatch(pending, {
        requestId,
        batchId,
        attempt,
        validationHints: Object.fromEntries(
          pending.map((reading) => [
            reading.reading_id,
            [...new Set(states.get(reading.reading_id).validationFailures)]
          ])
        )
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const failedLatencyMs = Math.max(0, Date.parse(completedAt) - Date.parse(attemptStartedAt));
      for (const reading of pending) {
        const state = states.get(reading.reading_id);
        state.inferenceCompletedAt = completedAt;
        state.inferenceLatencyMs += failedLatencyMs;
        state.lastProviderError = error.code || error.message || "slm_provider_error";
      }
      if (attempt <= config.maxRetries && typeof options.onRetry === "function") {
        await options.onRetry({
          batchId,
          requestId,
          attempt,
          readings: [...pending],
          reasons: [error.code || error.message || "slm_provider_error"]
        });
      }
      continue;
    }

    const validation = validateBatchResponse(providerResult.rawOutput, pending, {
      minConfidence: config.minConfidence
    });
    const retry = [];
    for (const reading of pending) {
      const state = states.get(reading.reading_id);
      state.outputReceived = true;
      state.inferenceCompletedAt = providerResult.completedAt;
      state.inferenceLatencyMs += Number(providerResult.latencyMs || 0);
      const accepted = validation.accepted.get(reading.reading_id);
      if (accepted) {
        const outcome = toAcceptedOutcome(state, accepted, providerResult, provider);
        outcome.slmWorkerId = workerId;
        acceptedOutcomes.set(reading.reading_id, outcome);
      } else {
        const errors = validation.rejected.get(reading.reading_id) || validation.batchErrors;
        state.validationFailures.push(...errors);
        retry.push(reading);
      }
    }
    if (retry.length && attempt <= config.maxRetries && typeof options.onRetry === "function") {
      await options.onRetry({
        batchId,
        requestId,
        attempt,
        readings: [...retry],
        reasons: [...new Set(retry.flatMap((reading) =>
          validation.rejected.get(reading.reading_id) || validation.batchErrors
        ))]
      });
    }
    pending = retry;
  }

  const outcomes = readings.map((reading) => {
    if (acceptedOutcomes.has(reading.reading_id)) return acceptedOutcomes.get(reading.reading_id);
    const outcome = toUnmappedOutcome(states.get(reading.reading_id), provider);
    outcome.slmWorkerId = workerId;
    return outcome;
  });

  return {
    batchId,
    workerId,
    inputCount: readings.length,
    mappedCount: outcomes.filter((outcome) => !outcome.safelyUnmapped).length,
    safelyUnmappedCount: outcomes.filter((outcome) => outcome.safelyUnmapped).length,
    outcomes
  };
}

module.exports = {
  createBatchId,
  mapReadingBatch,
  toAcceptedOutcome,
  toUnmappedOutcome
};
