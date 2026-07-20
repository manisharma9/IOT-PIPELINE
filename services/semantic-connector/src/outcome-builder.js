"use strict";

const { sanitizeUrnSegment } = require("./semantic-builder");

function confidenceLabel(confidence) {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

function buildMappingFromOutcome(outcome) {
  if (!outcome.mapping || outcome.safelyUnmapped) return null;
  return {
    saref_type: "saref:Measurement",
    saref_property: outcome.mapping.saref_property,
    saref_unit: outcome.mapping.saref_unit,
    saref4ener_concept: outcome.mapping.saref_concept,
    ngsi_type: "Property",
    ngsi_property: sanitizeUrnSegment(outcome.reading.reading_name).replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase()),
    mapping_confidence: confidenceLabel(outcome.mapping.confidence),
    explanation: outcome.mapping.mapping_reason_code,
    mapping_source: "slm_primary",
    slm_called: true,
    slm_provider: outcome.slmProvider,
    slm_model: outcome.slmModel,
    slm_worker_id: outcome.slmWorkerId,
    slm_batch_id: outcome.slmBatchId,
    slm_request_id: outcome.slmRequestId,
    slm_attempt_count: outcome.slmAttemptCount,
    slm_confidence: outcome.slmConfidence,
    fallback_reason: null,
    deterministic_validation: outcome.deterministicValidation,
    validation_source: "deterministic_guardrail"
  };
}

function buildSlmAuditRecord(outcome, processedAt = new Date().toISOString()) {
  const reading = outcome.reading;
  return {
    event_time: reading.event_time,
    reading_id: reading.reading_id,
    household_id: reading.household_id,
    device_id: reading.device_id,
    reading_name: reading.reading_name,
    slm_called: true,
    slm_provider: outcome.slmProvider,
    slm_model: outcome.slmModel,
    slm_worker_id: outcome.slmWorkerId,
    slm_batch_id: outcome.slmBatchId,
    slm_request_id: outcome.slmRequestId,
    slm_attempt_count: outcome.slmAttemptCount,
    slm_inference_started_at: outcome.slmInferenceStartedAt,
    slm_inference_completed_at: outcome.slmInferenceCompletedAt,
    slm_inference_latency_ms: outcome.slmInferenceLatencyMs,
    slm_output_received: outcome.slmOutputReceived,
    slm_mapping: outcome.mapping,
    slm_confidence: outcome.slmConfidence,
    deterministic_validation: outcome.deterministicValidation || {},
    validation_failure_reason: outcome.validationFailureReason,
    final_status: outcome.finalStatus,
    safely_unmapped: outcome.safelyUnmapped,
    inference_server_identity: outcome.inferenceServerIdentity,
    processed_at: processedAt,
    audit_payload: {
      request_ids: outcome.slmRequestIds,
      usage: outcome.usage,
      correlation_id: reading.correlation_id || null,
      no_prompt_stored: true,
      no_real_execution: true
    }
  };
}

module.exports = {
  buildMappingFromOutcome,
  buildSlmAuditRecord,
  confidenceLabel
};
