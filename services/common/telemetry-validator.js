"use strict";

const VALID_PROTOCOLS = new Set(["http", "mqtt"]);
const ALLOWED_FIELDS = new Set([
  "message_id",
  "correlation_id",
  "reading_ids",
  "household_id",
  "community_id",
  "device_id",
  "device_type",
  "timestamp",
  "readings",
  "protocol",
  "source",
  "metadata"
]);
const ALLOWED_METADATA_FIELDS = new Set([
  "area_id",
  "household_profile",
  "device_category",
  "time_zone",
  "occupancy_pattern",
  "base_load_profile",
  "display_name",
  "manufacturer",
  "online",
  "operating_state",
  "flexibility_capable",
  "maximum_flexible_power_kw",
  "measurement_capabilities",
  "selected_primary_field",
  "current_primary_measurement",
  "cumulative_energy_kwh",
  "reporting_offset_ms",
  "simulated",
  "no_real_execution"
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

function validateMetadata(metadata, errors) {
  if (metadata === undefined) return;
  if (!isPlainObject(metadata)) {
    addError(errors, "metadata", "metadata must be an object when provided");
    return;
  }

  for (const field of Object.keys(metadata)) {
    if (!ALLOWED_METADATA_FIELDS.has(field)) {
      addError(errors, `metadata.${field}`, "field is not allowed in telemetry metadata");
    }
  }
  for (const field of [
    "area_id",
    "household_profile",
    "device_category",
    "time_zone",
    "occupancy_pattern",
    "base_load_profile",
    "display_name",
    "manufacturer",
    "operating_state",
    "selected_primary_field"
  ]) {
    if (
      metadata[field] !== undefined &&
      metadata[field] !== null &&
      !isNonEmptyString(metadata[field])
    ) {
      addError(errors, `metadata.${field}`, "field must be null or a non-empty string");
    }
  }
  for (const field of ["online", "flexibility_capable"]) {
    if (metadata[field] !== undefined && typeof metadata[field] !== "boolean") {
      addError(errors, `metadata.${field}`, "field must be a boolean");
    }
  }
  for (const field of ["maximum_flexible_power_kw", "reporting_offset_ms"]) {
    if (
      metadata[field] !== undefined &&
      (!isFiniteNumber(metadata[field]) || metadata[field] < 0)
    ) {
      addError(errors, `metadata.${field}`, "field must be a non-negative finite number");
    }
  }
  if (
    metadata.cumulative_energy_kwh !== undefined &&
    metadata.cumulative_energy_kwh !== null &&
    (!isFiniteNumber(metadata.cumulative_energy_kwh) || metadata.cumulative_energy_kwh < 0)
  ) {
    addError(
      errors,
      "metadata.cumulative_energy_kwh",
      "field must be null or a non-negative finite number"
    );
  }
  if (
    metadata.current_primary_measurement !== undefined &&
    metadata.current_primary_measurement !== null
  ) {
    const measurement = metadata.current_primary_measurement;
    if (
      !isPlainObject(measurement) ||
      !isNonEmptyString(measurement.field) ||
      !isFiniteNumber(measurement.value) ||
      (
        measurement.unit !== null &&
        measurement.unit !== undefined &&
        !isNonEmptyString(measurement.unit)
      )
    ) {
      addError(
        errors,
        "metadata.current_primary_measurement",
        "field must contain field, finite value, and an optional unit"
      );
    }
  }
  if (
    metadata.measurement_capabilities !== undefined &&
    (
      !Array.isArray(metadata.measurement_capabilities) ||
      metadata.measurement_capabilities.some((value) => !isNonEmptyString(value))
    )
  ) {
    addError(
      errors,
      "metadata.measurement_capabilities",
      "field must be an array of non-empty reading names"
    );
  }
  if (metadata.simulated !== undefined && metadata.simulated !== true) {
    addError(errors, "metadata.simulated", "simulated telemetry must remain true");
  }
  if (metadata.no_real_execution !== undefined && metadata.no_real_execution !== true) {
    addError(
      errors,
      "metadata.no_real_execution",
      "no_real_execution must remain true"
    );
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

  for (const field of ["message_id", "correlation_id"]) {
    if (payload[field] !== undefined && !isNonEmptyString(payload[field])) {
      addError(errors, field, "field must be a non-empty string when provided");
    }
  }

  if (payload.reading_ids !== undefined) {
    if (!isPlainObject(payload.reading_ids)) {
      addError(errors, "reading_ids", "field must be an object when provided");
    } else {
      for (const [readingName, readingId] of Object.entries(payload.reading_ids)) {
        if (!isNonEmptyString(readingName) || !isNonEmptyString(readingId)) {
          addError(
            errors,
            `reading_ids.${readingName}`,
            "reading names and identifiers must be non-empty strings"
          );
        } else if (!payload.readings || !(readingName in payload.readings)) {
          addError(
            errors,
            `reading_ids.${readingName}`,
            "reading identifier must correspond to a supplied reading"
          );
        }
      }
    }
  }

  validateMetadata(payload.metadata, errors);

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
    ...(payload.message_id === undefined
      ? {}
      : { message_id: payload.message_id }),
    ...(payload.correlation_id === undefined
      ? {}
      : { correlation_id: payload.correlation_id }),
    ...(payload.reading_ids === undefined
      ? {}
      : { reading_ids: payload.reading_ids }),
    household_id: payload.household_id || payload.householdId || options.defaultHouseholdId,
    community_id: payload.community_id || payload.communityId || options.defaultCommunityId,
    device_id: payload.device_id || payload.deviceId,
    device_type: payload.device_type || payload.deviceType,
    timestamp: payload.timestamp,
    readings: payload.readings || normalizeReadingData(payload.data),
    protocol: payload.protocol || options.defaultProtocol || "http",
    source: payload.source || options.defaultSource || "api-ingest",
    ...(payload.metadata === undefined ? {} : { metadata: payload.metadata })
  };
}

module.exports = {
  ALLOWED_METADATA_FIELDS,
  VALID_PROTOCOLS,
  isPlainObject,
  isFiniteNumber,
  normalizeTelemetryPayload,
  validateMetadata,
  validateTelemetry
};
