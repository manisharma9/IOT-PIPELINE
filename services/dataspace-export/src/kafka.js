"use strict";

const { Kafka } = require("kafkajs");

function getKafkaBrokers(env = process.env) {
  const brokerValue = env.KAFKA_BROKERS || env.KAFKA_BROKER || "localhost:9092";

  return brokerValue
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function createKafka(env = process.env) {
  return new Kafka({
    clientId: env.KAFKA_CLIENT_ID || "adflex-dataspace-export",
    brokers: getKafkaBrokers(env)
  });
}

async function publishJson(producer, topic, payload, key) {
  if (!producer || typeof producer.send !== "function") {
    return false;
  }

  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(payload),
        headers: payload.correlation_id ? { correlation_id: payload.correlation_id } : undefined
      }
    ]
  });

  return true;
}

async function publishCatalogEvent(producer, topic, payload) {
  return publishJson(
    producer,
    topic,
    payload,
    [payload.catalog_id || "catalog", payload.generated_at || "generated"].join("/")
  );
}

async function publishExportAudit(producer, topic, payload) {
  return publishJson(
    producer,
    topic,
    payload,
    [payload.asset_id || "asset", payload.export_type || "export", payload.correlation_id || "audit"].join("/")
  );
}

module.exports = {
  createKafka,
  getKafkaBrokers,
  publishCatalogEvent,
  publishExportAudit,
  publishJson
};
