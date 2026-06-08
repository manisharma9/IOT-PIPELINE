"use strict";

const VALID_PROTOCOLS = new Set(["http", "mqtt"]);
const ALLOWED_FIELDS = new Set([
  "household_id",
  "community_id",
  "device_id",
  "device_type",
  "timestamp",
  "readings",
  "protocol",
  "source"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidDateTime(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateReading(readingName, reading, errors) {
  const path = `readings.${readingName}`;

  if (isFiniteNumber(reading)) {
    return;
  }

  if (!isPlainObject(reading)) {
    addError(errors, path, "reading must be a number or an object with a numeric value");
    return;
  }

  for (const field of Object.keys(reading)) {
    if (!["value", "unit"].includes(field)) {
      addError(errors, `${path}.${field}`, "field is not allowed on a reading object");
    }
  }

  if (!isFiniteNumber(reading.value)) {
    addError(errors, `${path}.value`, "reading value must be a finite number");
  }

  if ("unit" in reading && !isNonEmptyString(reading.unit)) {
    addError(errors, `${path}.unit`, "reading unit must be a non-empty string when provided");
  }
}

function validateTelemetry(payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: [{ path: "$", message: "payload must be a JSON object" }]
    };
  }

  for (const field of Object.keys(payload)) {
    if (!ALLOWED_FIELDS.has(field)) {
      addError(errors, field, "field is not allowed by the Phase 1 telemetry schema");
    }
  }

  for (const field of ["household_id", "community_id", "device_id", "device_type", "source"]) {
    if (!isNonEmptyString(payload[field])) {
      addError(errors, field, "field is required and must be a non-empty string");
    }
  }

  if (!isValidDateTime(payload.timestamp)) {
    addError(errors, "timestamp", "timestamp is required and must be a valid ISO 8601 date-time string");
  }

  if (!isNonEmptyString(payload.protocol) || !VALID_PROTOCOLS.has(payload.protocol)) {
    addError(errors, "protocol", "protocol is required and must be either http or mqtt");
  }

  if (!isPlainObject(payload.readings)) {
    addError(errors, "readings", "readings is required and must be an object");
  } else {
    const readingEntries = Object.entries(payload.readings);
    if (!readingEntries.length) {
      addError(errors, "readings", "readings must contain at least one measurement");
    }

    for (const [readingName, reading] of readingEntries) {
      if (!isNonEmptyString(readingName)) {
        addError(errors, "readings", "reading names must be non-empty strings");
        continue;
      }
      validateReading(readingName, reading, errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function normalizeReadingData(data) {
  if (!isPlainObject(data)) {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data).map(([name, reading]) => {
      if (isFiniteNumber(reading)) {
        return [name, reading];
      }

      if (isPlainObject(reading) && "value" in reading) {
        return [name, reading];
      }

      return [name, reading];
    })
  );
}

function normalizeTelemetryPayload(payload, options = {}) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const hasCompatibleShape =
    "deviceId" in payload ||
    "deviceType" in payload ||
    "data" in payload ||
    "householdId" in payload ||
    "communityId" in payload;

  if (!hasCompatibleShape) {
    return payload;
  }

  return {
    household_id: payload.household_id || payload.householdId || options.defaultHouseholdId,
    community_id: payload.community_id || payload.communityId || options.defaultCommunityId,
    device_id: payload.device_id || payload.deviceId,
    device_type: payload.device_type || payload.deviceType,
    timestamp: payload.timestamp,
    readings: payload.readings || normalizeReadingData(payload.data),
    protocol: payload.protocol || options.defaultProtocol || "http",
    source: payload.source || options.defaultSource || "api-ingest"
  };
}

module.exports = {
  VALID_PROTOCOLS,
  isPlainObject,
  isFiniteNumber,
  normalizeTelemetryPayload,
  validateTelemetry
};
