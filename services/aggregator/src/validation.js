"use strict";

const VALID_REQUESTED_ACTIONS = new Set([
  "reduce_load",
  "shift_load",
  "increase_export",
  "reduce_export"
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateString(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function extractGridSignal(event) {
  const payload = isPlainObject(event) ? event : {};
  const ieeePayload = isPlainObject(payload.ieee20305_payload) ? payload.ieee20305_payload : {};
  const embeddedSignal = isPlainObject(ieeePayload.signal) ? ieeePayload.signal : {};
  const embeddedDso = isPlainObject(ieeePayload.dso) ? ieeePayload.dso : {};
  const embeddedCommunity = isPlainObject(ieeePayload.community) ? ieeePayload.community : {};
  const rawSignal = Object.keys(embeddedSignal).length > 0 ? embeddedSignal : payload;

  return {
    signal_id: rawSignal.signal_id || rawSignal.id || payload.signal_id || payload.correlation_id,
    dso_id: rawSignal.dso_id || embeddedDso.id || payload.dso_id || null,
    community_id:
      rawSignal.community_id || embeddedCommunity.id || payload.community_id || null,
    signal_type: rawSignal.signal_type || rawSignal.type || payload.reading_name || "grid_signal",
    severity: rawSignal.severity,
    requested_action: rawSignal.requested_action,
    start_time: rawSignal.start_time,
    end_time: rawSignal.end_time,
    reason: rawSignal.reason || payload.explanation || "",
    household_id: payload.household_id || null,
    device_id: payload.device_id || null,
    source_topic: payload.source_topic || "grid.signals",
    correlation_id: payload.correlation_id || rawSignal.signal_id || rawSignal.id,
    source_grid_signal: payload,
    source_ieee20305_payload: payload.ieee20305_payload || null,
    raw_event: payload
  };
}

function validateGridSignalEvent(event) {
  const signal = extractGridSignal(event);
  const errors = [];

  if (!isNonEmptyString(signal.signal_id)) {
    errors.push("signal_id is required.");
  }

  if (!isNonEmptyString(signal.community_id)) {
    errors.push("community_id is required.");
  }

  if (!isNonEmptyString(signal.requested_action)) {
    errors.push("requested_action is required.");
  } else if (!VALID_REQUESTED_ACTIONS.has(signal.requested_action)) {
    errors.push(
      `requested_action must be one of: ${Array.from(VALID_REQUESTED_ACTIONS).join(", ")}.`
    );
  }

  if (!isNonEmptyString(signal.severity)) {
    errors.push("severity is required.");
  }

  if (!isValidDateString(signal.start_time)) {
    errors.push("start_time must be a valid date-time string.");
  }

  if (!isValidDateString(signal.end_time)) {
    errors.push("end_time must be a valid date-time string.");
  }

  if (
    isValidDateString(signal.start_time) &&
    isValidDateString(signal.end_time) &&
    Date.parse(signal.end_time) <= Date.parse(signal.start_time)
  ) {
    errors.push("end_time must be after start_time.");
  }

  return {
    valid: errors.length === 0,
    errors,
    value: signal
  };
}

function validateTranslatedEvent(event) {
  const errors = [];

  if (!isPlainObject(event)) {
    return {
      valid: false,
      errors: ["translated event must be a JSON object."]
    };
  }

  if (!isNonEmptyString(event.resource_type)) {
    errors.push("resource_type is required.");
  }

  if (!isPlainObject(event.ieee20305_payload)) {
    errors.push("ieee20305_payload must be an object.");
  }

  if (!isNonEmptyString(event.community_id)) {
    errors.push("community_id is required.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  VALID_REQUESTED_ACTIONS,
  extractGridSignal,
  validateGridSignalEvent,
  validateTranslatedEvent
};
