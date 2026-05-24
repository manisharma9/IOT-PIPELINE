"use strict";

function normalizeProtocol(protocol) {
  return String(protocol || "").trim().toLowerCase();
}

function normalizeTimestamp(timestamp) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Telemetry timestamp is not a valid date-time value.");
  }
  return parsed.toISOString();
}

function normalizeReading(readingName, reading) {
  if (typeof reading === "number") {
    return {
      reading_name: readingName,
      reading_value: reading,
      reading_unit: null
    };
  }

  return {
    reading_name: readingName,
    reading_value: Number(reading.value),
    reading_unit: reading.unit || null
  };
}

function normalizeTelemetry(payload) {
  const eventTime = normalizeTimestamp(payload.timestamp);
  const protocol = normalizeProtocol(payload.protocol);

  const base = {
    event_time: eventTime,
    household_id: payload.household_id,
    community_id: payload.community_id,
    device_id: payload.device_id,
    device_type: payload.device_type,
    protocol,
    source: payload.source
  };

  const normalizedRows = Object.entries(payload.readings).map(([readingName, reading]) => {
    const normalizedReading = normalizeReading(readingName, reading);
    return {
      ...base,
      ...normalizedReading,
      normalized_payload: {
        ...base,
        ...normalizedReading
      }
    };
  });

  return {
    rawRow: {
      ...base,
      payload
    },
    normalizedRows
  };
}

module.exports = {
  normalizeReading,
  normalizeTelemetry,
  normalizeTimestamp
};
