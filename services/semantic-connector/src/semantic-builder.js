"use strict";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeUrnSegment(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function buildEntityId(event) {
  const timeSegment = sanitizeUrnSegment(event.event_time);

  return [
    "urn:adflex:saref4ener",
    sanitizeUrnSegment(event.community_id),
    sanitizeUrnSegment(event.household_id),
    sanitizeUrnSegment(event.device_id),
    sanitizeUrnSegment(event.reading_name),
    timeSegment
  ].join(":");
}

function validateNormalizedTelemetryEvent(event) {
  const errors = [];

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return {
      valid: false,
      errors: ["normalized telemetry event must be a JSON object"]
    };
  }

  for (const field of [
    "event_time",
    "household_id",
    "community_id",
    "device_id",
    "device_type",
    "reading_name",
    "protocol",
    "source"
  ]) {
    if (!isNonEmptyString(event[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (!isNonEmptyString(event.event_time) || Number.isNaN(Date.parse(event.event_time))) {
    errors.push("event_time must be a valid date-time string");
  }

  if (!isFiniteNumber(event.reading_value)) {
    errors.push("reading_value must be a finite number");
  }

  if (
    event.reading_unit !== null &&
    event.reading_unit !== undefined &&
    !isNonEmptyString(event.reading_unit)
  ) {
    errors.push("reading_unit must be null or a non-empty string");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function buildSemanticPayload(event, mapping) {
  const entityId = buildEntityId(event);
  const slmAudit = {
    slm_called: Boolean(mapping.slm_called),
    slm_provider: mapping.slm_provider || null,
    slm_model: mapping.slm_model || null,
    slm_worker_id: mapping.slm_worker_id || null,
    slm_batch_id: mapping.slm_batch_id || null,
    slm_request_id: mapping.slm_request_id || null,
    slm_attempt_count: mapping.slm_attempt_count || null,
    slm_confidence: mapping.slm_confidence || null,
    fallback_reason: mapping.fallback_reason || null,
    deterministic_validation: mapping.deterministic_validation || null,
    validation_source: mapping.validation_source || null
  };

  return {
    context: {
      saref: "https://saref.etsi.org/core/",
      saref4ener: "https://saref.etsi.org/saref4ener/",
      ngsi_ld: "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
    },
    entity_id: entityId,
    entity_type: "EnergyFlexMeasurement",
    observed_at: event.event_time,
    device: {
      id: event.device_id,
      type: event.device_type
    },
    household: {
      id: event.household_id
    },
    community: {
      id: event.community_id
    },
    measurement: {
      reading_id: event.reading_id || null,
      name: event.reading_name,
      value: event.reading_value,
      unit: event.reading_unit,
      protocol: event.protocol,
      source: event.source,
      correlation_id: event.correlation_id || null
    },
    original_reading: {
      reading_id: event.reading_id || null,
      event_time: event.event_time,
      household_id: event.household_id,
      community_id: event.community_id,
      device_id: event.device_id,
      device_type: event.device_type,
      reading_name: event.reading_name,
      reading_value: event.reading_value,
      reading_unit: event.reading_unit,
      protocol: event.protocol,
      source: event.source,
      correlation_id: event.correlation_id || null
    },
    saref: {
      type: mapping.saref_type,
      property: mapping.saref_property,
      unit: mapping.saref_unit || event.reading_unit || null
    },
    saref4ener: {
      concept: mapping.saref4ener_concept
    },
    ngsi: {
      type: mapping.ngsi_type,
      property: mapping.ngsi_property
    },
    explanation: mapping.explanation,
    mapping_source: mapping.mapping_source,
    mapping_confidence: mapping.mapping_confidence,
    slm_confidence: mapping.slm_confidence || null,
    slm_audit: slmAudit,
    mapping: {
      source: mapping.mapping_source,
      confidence: mapping.mapping_confidence,
      explanation: mapping.explanation,
      mapping_source: mapping.mapping_source,
      mapping_confidence: mapping.mapping_confidence,
      slm_confidence: mapping.slm_confidence || null,
      slm_called: slmAudit.slm_called,
      slm_provider: slmAudit.slm_provider,
      slm_model: slmAudit.slm_model,
      slm_worker_id: slmAudit.slm_worker_id,
      slm_batch_id: slmAudit.slm_batch_id,
      slm_request_id: slmAudit.slm_request_id,
      slm_attempt_count: slmAudit.slm_attempt_count,
      fallback_reason: slmAudit.fallback_reason,
      deterministic_validation: slmAudit.deterministic_validation,
      validation_source: slmAudit.validation_source
    }
  };
}

function buildSemanticEvent(event, mapping, semanticPayload, processedAt = new Date().toISOString()) {
  return {
    reading_id: event.reading_id || null,
    event_time: event.event_time,
    processed_at: processedAt,
    household_id: event.household_id,
    community_id: event.community_id,
    device_id: event.device_id,
    device_type: event.device_type,
    reading_name: event.reading_name,
    reading_value: event.reading_value,
    reading_unit: event.reading_unit || null,
    saref_type: mapping.saref_type,
    saref_property: mapping.saref_property,
    saref_unit: mapping.saref_unit || event.reading_unit || null,
    saref4ener_concept: mapping.saref4ener_concept,
    ngsi_type: mapping.ngsi_type,
    ngsi_property: mapping.ngsi_property,
    semantic_payload: semanticPayload,
    mapping_source: mapping.mapping_source,
    mapping_confidence: mapping.mapping_confidence,
    slm_called: Boolean(mapping.slm_called),
    slm_provider: mapping.slm_provider || null,
    slm_model: mapping.slm_model || null,
    slm_confidence: mapping.slm_confidence || null,
    fallback_reason: mapping.fallback_reason || null,
    explanation: mapping.explanation,
    correlation_id: event.correlation_id || null,
    enrichment_status: mapping.mapping_source === "unmapped" ? "unmapped" : "mapped",
    final_status: mapping.mapping_source === "unmapped" ? "safely_unmapped" : "mapped",
    safely_unmapped: mapping.mapping_source === "unmapped"
  };
}

module.exports = {
  buildEntityId,
  buildSemanticEvent,
  buildSemanticPayload,
  sanitizeUrnSegment,
  validateNormalizedTelemetryEvent
};
