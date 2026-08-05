"use strict";

const crypto = require("node:crypto");

function buildCorrelationId(metadata, payload = null) {
  if (payload && typeof payload.correlation_id === "string" && payload.correlation_id.trim()) {
    return payload.correlation_id.trim();
  }

  if (payload && typeof payload.message_id === "string" && payload.message_id.trim()) {
    return payload.message_id.trim();
  }

  if (
    metadata.topic &&
    Number.isInteger(metadata.partition) &&
    Number.isInteger(metadata.offset)
  ) {
    return `${metadata.topic}:${metadata.partition}:${metadata.offset}`;
  }

  return null;
}

function buildReadingId(row, correlationId) {
  const identity = [
    correlationId || "no-correlation",
    row.event_time,
    row.community_id,
    row.household_id,
    row.device_id,
    row.reading_name
  ].join(":");
  return `reading_${crypto.createHash("sha256").update(identity).digest("hex")}`;
}

function assignReadingIds(normalizedTelemetry, correlationId) {
  const normalizedRows = normalizedTelemetry.normalizedRows.map((row) => {
    const readingId = row.reading_id || buildReadingId(row, correlationId);
    return {
      ...row,
      reading_id: readingId,
      normalized_payload: {
        ...row.normalized_payload,
        reading_id: readingId,
        correlation_id: correlationId
      }
    };
  });
  return { ...normalizedTelemetry, normalizedRows };
}

function buildNormalizedTelemetryEvent(row, correlationId) {
  return {
    reading_id: row.reading_id || buildReadingId(row, correlationId),
    event_time: row.event_time,
    household_id: row.household_id,
    community_id: row.community_id,
    device_id: row.device_id,
    device_type: row.device_type,
    reading_name: row.reading_name,
    reading_value: row.reading_value,
    reading_unit: row.reading_unit,
    protocol: row.protocol,
    source: row.source,
    ...(row.device_context ? { device_context: row.device_context } : {}),
    correlation_id: correlationId
  };
}

function buildNormalizedTelemetryMessages(normalizedRows, correlationId) {
  return normalizedRows.map((row) => {
    const event = buildNormalizedTelemetryEvent(row, correlationId);

    return {
      key: [row.community_id, row.household_id, row.device_id].join("/"),
      value: JSON.stringify(event),
      headers: correlationId ? { correlation_id: correlationId } : undefined
    };
  });
}

async function publishNormalizedTelemetry(producer, topic, normalizedRows, correlationId) {
  if (!producer || typeof producer.send !== "function" || normalizedRows.length === 0) {
    return;
  }

  await producer.send({
    topic,
    messages: buildNormalizedTelemetryMessages(normalizedRows, correlationId)
  });
}

module.exports = {
  assignReadingIds,
  buildCorrelationId,
  buildReadingId,
  buildNormalizedTelemetryEvent,
  buildNormalizedTelemetryMessages,
  publishNormalizedTelemetry
};
