"use strict";

const { Kafka } = require("kafkajs");

function getKafkaBrokers(configOrEnv = process.env) {
  const brokerValue =
    configOrEnv.kafkaBrokers ||
    configOrEnv.KAFKA_BROKERS ||
    configOrEnv.KAFKA_BROKER ||
    "localhost:9092";

  return brokerValue
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function createKafka(config = {}) {
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "adflex-security-gateway",
    brokers: getKafkaBrokers(config)
  });
}

async function publishSecurityGatewayAudit(producer, topic, payload) {
  if (!producer || typeof producer.send !== "function") {
    return;
  }

  await producer.send({
    topic,
    messages: [
      {
        key: [payload.client_ip || "unknown", payload.decision || "decision"].join("/"),
        value: JSON.stringify(payload),
        headers: payload.correlation_id ? { correlation_id: payload.correlation_id } : undefined
      }
    ]
  });
}

module.exports = {
  createKafka,
  getKafkaBrokers,
  publishSecurityGatewayAudit
};
