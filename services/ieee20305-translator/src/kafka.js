"use strict";

const { Kafka } = require("kafkajs");
const { safeInsertIeee20305Event } = require("./db");
const { translateSemanticEvent } = require("./translator");

function getKafkaBrokers(env = process.env) {
  const brokerValue = env.KAFKA_BROKERS || env.KAFKA_BROKER || "localhost:9092";

  return brokerValue
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function createKafka(env = process.env) {
  return new Kafka({
    clientId: env.KAFKA_CLIENT_ID || "adflex-ieee20305-translator",
    brokers: getKafkaBrokers(env)
  });
}

function buildKafkaMetadata(topic, partition, message) {
  return {
    topic,
    partition,
    offset: message && message.offset ? Number(message.offset) : null
  };
}

function buildTranslatedMessageKey(event) {
  return [
    event.community_id || "community",
    event.household_id || "grid",
    event.device_id || "signal",
    event.reading_name || event.resource_type
  ].join("/");
}

async function publishTranslatedEvent(producer, topic, translatedEvent) {
  if (!producer || typeof producer.send !== "function") {
    return;
  }

  await producer.send({
    topic,
    messages: [
      {
        key: buildTranslatedMessageKey(translatedEvent),
        value: JSON.stringify(translatedEvent),
        headers: translatedEvent.correlation_id
          ? { correlation_id: translatedEvent.correlation_id }
          : undefined
      }
    ]
  });
}

async function publishGridSignal(producer, topic, gridSignalEvent) {
  await publishTranslatedEvent(producer, topic, gridSignalEvent);
}

async function processSemanticKafkaMessage({
  topic,
  partition,
  message,
  pool,
  producer,
  translatedTopic = "ieee20305.translated"
}) {
  const metadata = buildKafkaMetadata(topic, partition, message);
  const rawMessage = message && message.value ? message.value.toString("utf8") : "";
  let semanticEvent;

  try {
    semanticEvent = JSON.parse(rawMessage);
  } catch (error) {
    semanticEvent = {
      event_time: new Date().toISOString(),
      correlation_id: `${metadata.topic}:${metadata.partition}:${metadata.offset}`,
      parse_error: error.message,
      raw_message: rawMessage
    };
  }

  const translatedEvent = translateSemanticEvent(semanticEvent, {
    sourceTopic: topic,
    outputTopic: translatedTopic
  });

  const stored = await safeInsertIeee20305Event(pool, translatedEvent);
  if (!stored) {
    return {
      status: "error",
      error: "database_insert_failed"
    };
  }

  await publishTranslatedEvent(producer, translatedTopic, translatedEvent);

  return {
    status: "processed",
    resource_type: translatedEvent.resource_type,
    translation_status: translatedEvent.translation_status,
    topic: translatedTopic
  };
}

async function startSemanticConsumer({
  consumer,
  pool,
  producer,
  semanticTopic = "semantic.enriched",
  translatedTopic = "ieee20305.translated"
}) {
  await consumer.subscribe({
    topic: semanticTopic,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const result = await processSemanticKafkaMessage({
          topic,
          partition,
          message,
          pool,
          producer,
          translatedTopic
        });

        console.log(
          `IEEE 2030.5 translator processed semantic event as ${result.resource_type} with status ${result.translation_status}`
        );
      } catch (error) {
        console.error("IEEE 2030.5 translator failed to process semantic event:", error);
      }
    }
  });
}

module.exports = {
  buildKafkaMetadata,
  buildTranslatedMessageKey,
  createKafka,
  getKafkaBrokers,
  processSemanticKafkaMessage,
  publishGridSignal,
  publishTranslatedEvent,
  startSemanticConsumer
};
