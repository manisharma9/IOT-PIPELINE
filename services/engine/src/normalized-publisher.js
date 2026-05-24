"use strict";

function buildCorrelationId(metadata) {
  if (
    metadata.topic &&
    Number.isInteger(metadata.partition) &&
    Number.isInteger(metadata.offset)
  ) {
    return `${metadata.topic}:${metadata.partition}:${metadata.offset}`;
  }

  return null;
}

function buildNormalizedTelemetryEvent(row, correlationId) {
  return {
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
    correlation_id: correlationId
  };
}

function buildNormalizedTelemetryMessages(normalizedRows, correlationId) {
  return normalizedRows.map((row) => {
    const event = buildNormalizedTelemetryEvent(row, correlationId);

    return {
      key: [row.community_id, row.household_id, row.device_id, row.reading_name].join("/"),
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
  buildCorrelationId,
  buildNormalizedTelemetryEvent,
  buildNormalizedTelemetryMessages,
  publishNormalizedTelemetry
};
