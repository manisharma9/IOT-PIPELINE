"use strict";

const express = require("express");
const { Kafka } = require("kafkajs");
const { validateTelemetry } = require("../../common/telemetry-validator");

const PORT = Number(process.env.PORT || 3001);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "adflex-ingestion-api";
const RAW_TELEMETRY_TOPIC = process.env.RAW_TELEMETRY_TOPIC || "raw.telemetry";
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";

function buildMessageKey(payload) {
  return [payload.community_id, payload.household_id, payload.device_id].join("/");
}

function createKafkaProducer() {
  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS
  });

  return kafka.producer();
}

function createApp({ producer, topic = RAW_TELEMETRY_TOPIC } = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "ingestion-api",
      topic
    });
  });

  app.post("/telemetry", async (request, response) => {
    const validation = validateTelemetry(request.body);

    if (!validation.valid) {
      return response.status(400).json({
        error: "invalid_telemetry",
        message: "Telemetry payload failed validation.",
        details: validation.errors
      });
    }

    if (!producer || typeof producer.send !== "function") {
      return response.status(503).json({
        error: "kafka_unavailable",
        message: "Kafka producer is not available."
      });
    }

    const receivedAt = new Date().toISOString();
    const key = buildMessageKey(request.body);

    try {
      await producer.send({
        topic,
        messages: [
          {
            key,
            value: JSON.stringify(request.body),
            headers: {
              received_at: receivedAt,
              source_protocol: request.body.protocol
            }
          }
        ]
      });
    } catch (error) {
      console.error("Kafka publish failed:", error);
      return response.status(503).json({
        error: "kafka_publish_failed",
        message: "Telemetry was valid but could not be published to Kafka."
      });
    }

    return response.status(202).json({
      status: "accepted",
      topic,
      key,
      received_at: receivedAt
    });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected ingestion API error."
    });
  });

  return app;
}

async function start() {
  const producer = createKafkaProducer();
  await producer.connect();

  const app = createApp({ producer });
  const server = app.listen(PORT, () => {
    console.log(`Ingestion API listening on http://0.0.0.0:${PORT}`);
    console.log(`Publishing valid telemetry to Kafka topic ${RAW_TELEMETRY_TOPIC}`);
  });

  const shutdown = async () => {
    console.log("Shutting down ingestion API...");
    server.close();
    await producer.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Ingestion API failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  buildMessageKey,
  createApp,
  createKafkaProducer
};
