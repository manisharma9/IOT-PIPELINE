"use strict";

const { Kafka } = require("kafkajs");
const { validateTelemetry } = require("../../common/telemetry-validator");
const { createPool, insertProcessingError, insertTelemetryBatch } = require("./db");
const { normalizeTelemetry } = require("./normalizer");
const {
  buildCorrelationId,
  buildNormalizedTelemetryEvent,
  buildNormalizedTelemetryMessages,
  publishNormalizedTelemetry
} = require("./normalized-publisher");

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "adflex-engine";
const ENGINE_GROUP_ID = process.env.ENGINE_GROUP_ID || "energy-flex-engine";
const RAW_TELEMETRY_TOPIC = process.env.RAW_TELEMETRY_TOPIC || "raw.telemetry";
const NORMALIZED_TELEMETRY_TOPIC =
  process.env.NORMALIZED_TELEMETRY_TOPIC || "normalized.telemetry";

function buildKafkaMetadata(topic, partition, message) {
  return {
    topic,
    partition,
    offset: message.offset ? Number(message.offset) : null
  };
}

async function logProcessingError(pool, metadata, rawMessage, payload, error) {
  try {
    await insertProcessingError(pool, {
      service_name: "engine",
      error_type: error.name || "ProcessingError",
      error_message: error.message,
      payload,
      raw_message: rawMessage,
      kafka_topic: metadata.topic,
      kafka_partition: metadata.partition,
      kafka_offset: metadata.offset
    });
  } catch (dbError) {
    console.error("Could not store processing error:", dbError);
  }
}

async function processRawTelemetryMessage({
  topic,
  partition,
  message,
  pool,
  producer,
  normalizedTopic = NORMALIZED_TELEMETRY_TOPIC
}) {
  const metadata = buildKafkaMetadata(topic, partition, message);
  const correlationId = buildCorrelationId(metadata);
  const rawMessage = message.value ? message.value.toString("utf8") : "";
  let payload = null;

  try {
    payload = JSON.parse(rawMessage);

    const validation = validateTelemetry(payload);
    if (!validation.valid) {
      const validationError = new Error(JSON.stringify(validation.errors));
      validationError.name = "TelemetryValidationError";
      throw validationError;
    }

    const normalizedTelemetry = normalizeTelemetry(payload);
    await insertTelemetryBatch(pool, normalizedTelemetry, metadata);
    await publishNormalizedTelemetry(
      producer,
      normalizedTopic,
      normalizedTelemetry.normalizedRows,
      correlationId
    );

    console.log(
      `Processed telemetry ${payload.community_id}/${payload.household_id}/${payload.device_id} at offset ${metadata.offset} and published ${normalizedTelemetry.normalizedRows.length} normalized event(s) to ${normalizedTopic}`
    );

    return {
      status: "processed",
      normalized_count: normalizedTelemetry.normalizedRows.length
    };
  } catch (error) {
    await logProcessingError(pool, metadata, rawMessage, payload, error);
    console.warn(`Stored processing error for Kafka offset ${metadata.offset}: ${error.message}`);

    return {
      status: "error",
      error: error.message
    };
  }
}

async function start() {
  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS
  });
  const consumer = kafka.consumer({ groupId: ENGINE_GROUP_ID });
  const producer = kafka.producer();
  const pool = createPool();

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({
    topic: RAW_TELEMETRY_TOPIC,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      await processRawTelemetryMessage({
        topic,
        partition,
        message,
        pool,
        producer,
        normalizedTopic: NORMALIZED_TELEMETRY_TOPIC
      });
    }
  });

  const shutdown = async () => {
    console.log("Shutting down engine...");
    await consumer.disconnect();
    await producer.disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Engine failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  buildCorrelationId,
  buildNormalizedTelemetryEvent,
  buildNormalizedTelemetryMessages,
  processRawTelemetryMessage
};
