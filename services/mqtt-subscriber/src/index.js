"use strict";

const mqtt = require("mqtt");
const { Kafka } = require("kafkajs");
const { validateTelemetry } = require("../../common/telemetry-validator");

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const MQTT_TOPIC_FILTER = process.env.MQTT_TOPIC_FILTER || "telemetry/#";
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "adflex-mqtt-subscriber";
const RAW_TELEMETRY_TOPIC = process.env.RAW_TELEMETRY_TOPIC || "raw.telemetry";

function buildMessageKey(payload) {
  return [payload.community_id, payload.household_id, payload.device_id].join("/");
}

async function start() {
  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS
  });
  const producer = kafka.producer();
  await producer.connect();

  const client = mqtt.connect(MQTT_BROKER_URL);

  client.on("connect", () => {
    console.log(`Connected to MQTT broker ${MQTT_BROKER_URL}`);
    client.subscribe(MQTT_TOPIC_FILTER, (error) => {
      if (error) {
        console.error("MQTT subscribe failed:", error);
        return;
      }
      console.log(`Subscribed to MQTT topic filter ${MQTT_TOPIC_FILTER}`);
    });
  });

  client.on("message", async (topic, message) => {
    const rawMessage = message.toString("utf8");
    let payload;

    try {
      payload = JSON.parse(rawMessage);
    } catch (error) {
      console.warn(`Skipping invalid JSON from MQTT topic ${topic}: ${error.message}`);
      return;
    }

    const validation = validateTelemetry(payload);
    if (!validation.valid) {
      console.warn(`Skipping invalid telemetry from MQTT topic ${topic}:`, validation.errors);
      return;
    }

    try {
      await producer.send({
        topic: RAW_TELEMETRY_TOPIC,
        messages: [
          {
            key: buildMessageKey(payload),
            value: JSON.stringify(payload),
            headers: {
              mqtt_topic: topic,
              received_at: new Date().toISOString(),
              source_protocol: "mqtt"
            }
          }
        ]
      });
      console.log(`Published MQTT telemetry from ${topic} to Kafka topic ${RAW_TELEMETRY_TOPIC}`);
    } catch (error) {
      console.error("Kafka publish failed for MQTT telemetry:", error);
    }
  });

  const shutdown = async () => {
    console.log("Shutting down MQTT subscriber...");
    client.end(true);
    await producer.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("MQTT subscriber failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  buildMessageKey
};
