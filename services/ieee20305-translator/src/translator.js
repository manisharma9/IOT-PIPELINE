"use strict";

const gridSignalSchema = require("../../../schemas/grid-signal.schema.json");

const GRID_SIGNAL_TYPES = new Set(gridSignalSchema.properties.signal_type.enum);
const GRID_SIGNAL_ACTIONS = new Set(gridSignalSchema.properties.requested_action.enum);
const GRID_SIGNAL_SEVERITIES = new Set(gridSignalSchema.properties.severity.enum);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeString(value) {
  return String(value || "").trim();
}

function sanitizeHrefSegment(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeTimestamp(value, fallback = new Date().toISOString()) {
  if (!isNonEmptyString(value)) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function validateSemanticEvent(event) {
  const errors = [];

  if (!isPlainObject(event)) {
    return {
      valid: false,
      errors: ["semantic event must be a JSON object"]
    };
  }

  for (const field of [
    "event_time",
    "household_id",
    "community_id",
    "device_id",
    "device_type",
    "reading_name"
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

  if (event.semantic_payload !== undefined && !isPlainObject(event.semantic_payload)) {
    errors.push("semantic_payload must be a JSON object when provided");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function determineResourceType(event) {
  const readingName = normalizeString(event.reading_name).toLowerCase();
  const deviceType = normalizeString(event.device_type).toLowerCase();
  const concept = normalizeString(event.saref4ener_concept).toLowerCase();

  if (
    readingName.includes("grid_stress") ||
    readingName.includes("curtailment") ||
    readingName.includes("flexibility") ||
    concept.includes("gridcondition")
  ) {
    return "DERControlCandidate";
  }

  if (
    readingName.includes("pv_") ||
    readingName.includes("battery") ||
    readingName.includes("ev_") ||
    deviceType.includes("pv") ||
    deviceType.includes("battery") ||
    deviceType.includes("ev") ||
    deviceType.includes("der") ||
    concept.includes("pvgeneration") ||
    concept.includes("battery") ||
    concept.includes("evcharging")
  ) {
    return "DERStatus";
  }

  return "MirrorMeterReading";
}

function buildHref(resourceType, event) {
  const community = sanitizeHrefSegment(event.community_id);
  const household = sanitizeHrefSegment(event.household_id);
  const device = sanitizeHrefSegment(event.device_id);
  const reading = sanitizeHrefSegment(event.reading_name);
  const time = sanitizeHrefSegment(event.event_time);

  if (resourceType === "DERStatus") {
    return `/edev/${community}/${household}/der/${device}/status/${reading}/${time}`;
  }

  if (resourceType === "DERControlCandidate") {
    return `/edev/${community}/${household}/der/${device}/control-candidates/${reading}/${time}`;
  }

  return `/edev/${community}/${household}/mup/${device}/readings/${reading}/${time}`;
}

function buildSuggestedGridMeaning(event, resourceType) {
  const readingName = normalizeString(event.reading_name).toLowerCase();

  if (resourceType === "DERStatus") {
    return "Distributed energy resource state that may later inform flexibility availability.";
  }

  if (resourceType === "DERControlCandidate") {
    return "Grid-relevant signal candidate that may later inform aggregator decisions.";
  }

  if (readingName.includes("active_power")) {
    return "Instantaneous power reading suitable for meter-style grid visibility.";
  }

  if (readingName.includes("energy")) {
    return "Energy reading suitable for cumulative meter-style grid visibility.";
  }

  return "Meter-style telemetry reading suitable for grid visibility.";
}

function buildSemanticSource(event) {
  return {
    mapping_source: event.mapping_source || null,
    mapping_confidence: event.mapping_confidence || null,
    saref_type: event.saref_type || null,
    saref_property: event.saref_property || null,
    saref_unit: event.saref_unit || null,
    saref4ener_concept: event.saref4ener_concept || null,
    ngsi_type: event.ngsi_type || null,
    ngsi_property: event.ngsi_property || null
  };
}

function buildDsoGatewayContext(resourceType) {
  return {
    gateway_role: "DSO-facing IEEE 2030.5-style translation gateway",
    certification_status: "foundation_only_not_certified",
    mirror_meter:
      resourceType === "MirrorMeterReading"
        ? {
            resource_type: "MirrorMeter",
            reading_resource_type: "MirrorMeterReading",
            meaning: "Meter-style reading exposed through a simplified MirrorMeter/MirrorMeterReading concept."
          }
        : null,
    der_status:
      resourceType === "DERStatus"
        ? {
            resource_type: "DERStatus",
            meaning: "Distributed energy resource state representation for PV, battery, EV, or flexible load context."
          }
        : null
  };
}


function buildInvalidSemanticTranslation(rawEvent, errors, options = {}) {
  const processedAt = options.processedAt || new Date().toISOString();
  const eventTime = normalizeTimestamp(rawEvent && rawEvent.event_time, processedAt);

  return {
    event_time: eventTime,
    processed_at: processedAt,
    source_topic: options.sourceTopic || "semantic.enriched",
    output_topic: options.outputTopic || "ieee20305.translated",
    household_id: rawEvent && rawEvent.household_id ? String(rawEvent.household_id) : null,
    community_id: rawEvent && rawEvent.community_id ? String(rawEvent.community_id) : null,
    device_id: rawEvent && rawEvent.device_id ? String(rawEvent.device_id) : null,
    device_type: rawEvent && rawEvent.device_type ? String(rawEvent.device_type) : null,
    reading_name: rawEvent && rawEvent.reading_name ? String(rawEvent.reading_name) : null,
    resource_type: "MirrorMeterReading",
    ieee20305_payload: {
      resource_type: "MirrorMeterReading",
      dso_gateway_context: buildDsoGatewayContext("MirrorMeterReading"),
      href: `/edev/unknown/invalid-semantic/${sanitizeHrefSegment(eventTime)}`,
      event_time: eventTime,
      translation_status: "invalid_semantic_event",
      errors,
      note: "Invalid semantic input was not translated into a certified IEEE 2030.5 resource."
    },
    translation_status: "invalid_semantic_event",
    translation_confidence: "low",
    explanation: `Semantic event could not be translated: ${errors.join("; ")}`,
    correlation_id: rawEvent && rawEvent.correlation_id ? String(rawEvent.correlation_id) : null,
    raw_semantic_payload: isPlainObject(rawEvent) ? rawEvent : { raw_value: rawEvent ?? null }
  };
}

function translateSemanticEvent(event, options = {}) {
  const validation = validateSemanticEvent(event);
  if (!validation.valid) {
    return buildInvalidSemanticTranslation(event, validation.errors, options);
  }

  const processedAt = options.processedAt || new Date().toISOString();
  const eventTime = normalizeTimestamp(event.event_time, processedAt);
  const resourceType = determineResourceType(event);
  const payload = {
    resource_type: resourceType,
    href: buildHref(resourceType, event),
    event_time: eventTime,
    device: {
      id: event.device_id,
      type: event.device_type,
      href: `/edev/${sanitizeHrefSegment(event.community_id)}/${sanitizeHrefSegment(
        event.household_id
      )}/devices/${sanitizeHrefSegment(event.device_id)}`
    },
    household: {
      id: event.household_id
    },
    community: {
      id: event.community_id
    },
    measurement: {
      name: event.reading_name,
      value: event.reading_value,
      unit: event.reading_unit || event.saref_unit || null
    },
    semantic_source: buildSemanticSource(event),
    dso_gateway_context: buildDsoGatewayContext(resourceType),
    suggested_grid_meaning: buildSuggestedGridMeaning(event, resourceType),
    correlation_id: event.correlation_id || null,
    note: "IEEE 2030.5-style translator foundation payload; not a certified IEEE 2030.5 resource."
  };

  return {
    event_time: eventTime,
    processed_at: processedAt,
    source_topic: options.sourceTopic || "semantic.enriched",
    output_topic: options.outputTopic || "ieee20305.translated",
    household_id: event.household_id,
    community_id: event.community_id,
    device_id: event.device_id,
    device_type: event.device_type,
    reading_name: event.reading_name,
    resource_type: resourceType,
    ieee20305_payload: payload,
    translation_status: "translated",
    translation_confidence: event.mapping_confidence || "medium",
    explanation: `Semantic event translated into ${resourceType} style payload for downstream grid-service integration.`,
    correlation_id: event.correlation_id || null,
    raw_semantic_payload: event
  };
}

function validateGridSignal(signal) {
  const errors = [];

  if (!isPlainObject(signal)) {
    return {
      valid: false,
      errors: ["grid signal must be a JSON object"]
    };
  }

  for (const field of gridSignalSchema.required) {
    if (!isNonEmptyString(signal[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(signal.signal_type) && !GRID_SIGNAL_TYPES.has(signal.signal_type)) {
    errors.push(
      `signal_type must be one of: ${Array.from(GRID_SIGNAL_TYPES).join(", ")}`
    );
  }

  if (
    isNonEmptyString(signal.requested_action) &&
    !GRID_SIGNAL_ACTIONS.has(signal.requested_action)
  ) {
    errors.push(
      `requested_action must be one of: ${Array.from(GRID_SIGNAL_ACTIONS).join(", ")}`
    );
  }

  if (isNonEmptyString(signal.severity) && !GRID_SIGNAL_SEVERITIES.has(signal.severity)) {
    errors.push(`severity must be one of: ${Array.from(GRID_SIGNAL_SEVERITIES).join(", ")}`);
  }

  const startTime = Date.parse(signal.start_time);
  const endTime = Date.parse(signal.end_time);

  if (!isNonEmptyString(signal.start_time) || Number.isNaN(startTime)) {
    errors.push("start_time must be a valid date-time string");
  }

  if (!isNonEmptyString(signal.end_time) || Number.isNaN(endTime)) {
    errors.push("end_time must be a valid date-time string");
  }

  if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime <= startTime) {
    errors.push("end_time must be after start_time");
  }

  if (isNonEmptyString(signal.reason) && signal.reason.length > 500) {
    errors.push("reason must be 500 characters or fewer");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function buildGridSignalHref(signal) {
  return `/dso/${sanitizeHrefSegment(signal.dso_id)}/communities/${sanitizeHrefSegment(
    signal.community_id
  )}/grid-signals/${sanitizeHrefSegment(signal.signal_id)}`;
}

function translateGridSignal(signal, options = {}) {
  const validation = validateGridSignal(signal);
  if (!validation.valid) {
    return {
      status: "error",
      errors: validation.errors,
      event: null
    };
  }

  const processedAt = options.processedAt || new Date().toISOString();
  const eventTime = normalizeTimestamp(signal.start_time, processedAt);
  const payload = {
    resource_type: "GridSignal",
    href: buildGridSignalHref(signal),
    event_time: eventTime,
    dso: {
      id: signal.dso_id
    },
    community: {
      id: signal.community_id
    },
    signal: {
      id: signal.signal_id,
      type: signal.signal_type,
      severity: signal.severity,
      requested_action: signal.requested_action,
      start_time: normalizeTimestamp(signal.start_time, eventTime),
      end_time: normalizeTimestamp(signal.end_time, eventTime),
      reason: signal.reason
    },
    suggested_grid_meaning:
      "Mock DSO grid signal for later aggregator evaluation; no household dispatch is performed in Phase 4.",
    dso_gateway_context: {
      gateway_role: "DSO-facing IEEE 2030.5-style grid signal gateway",
      certification_status: "foundation_only_not_certified",
      resource_type: "GridSignal",
      related_concepts: ["DERControl", "DERProgram", "DERControlCandidate"]
    },
    note: "IEEE 2030.5-style GridSignal foundation payload; not a certified IEEE 2030.5 resource."
  };

  return {
    status: "translated",
    errors: [],
    event: {
      event_time: eventTime,
      processed_at: processedAt,
      source_topic: options.sourceTopic || "http.post./dso/grid-signal",
      output_topic: options.outputTopic || "grid.signals",
      household_id: null,
      community_id: signal.community_id,
      device_id: null,
      device_type: null,
      reading_name: signal.signal_type,
      resource_type: "GridSignal",
      ieee20305_payload: payload,
      translation_status: "translated",
      translation_confidence: "high",
      explanation:
        "DSO grid signal translated into a GridSignal style payload for later aggregator evaluation; no dispatch command was sent.",
      correlation_id: signal.signal_id,
      raw_semantic_payload: signal
    }
  };
}

module.exports = {
  buildGridSignalHref,
  determineResourceType,
  sanitizeHrefSegment,
  translateGridSignal,
  translateSemanticEvent,
  validateGridSignal,
  validateSemanticEvent
};
