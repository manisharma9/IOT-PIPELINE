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
    clientId: env.KAFKA_CLIENT_ID || "adflex-approval-workflow",
    brokers: getKafkaBrokers(env)
  });
}

async function publishJson(producer, topic, payload, key) {
  if (!producer || typeof producer.send !== "function") {
    return;
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
}

async function publishApprovalAudit(producer, topic, auditEvent) {
  await publishJson(
    producer,
    topic,
    auditEvent,
    [
      auditEvent.dispatch_command_id || "dispatch",
      auditEvent.new_status || "status",
      auditEvent.action || "approval"
    ].join("/")
  );
}

async function publishReadyCommand(producer, topic, readyEvent) {
  await publishJson(
    producer,
    topic,
    readyEvent,
    [readyEvent.community_id || "community", readyEvent.proposal_id || readyEvent.id].join("/")
  );
}

function buildKafkaMetadata(topic, partition, message) {
  return {
    topic,
    partition,
    offset: message && message.offset ? Number(message.offset) : null
  };
}

async function processProposedMessage({ topic, partition, message }) {
  const metadata = buildKafkaMetadata(topic, partition, message);
  const rawMessage = message && message.value ? message.value.toString("utf8") : "";

  try {
    const proposal = JSON.parse(rawMessage);
    return {
      status: "seen",
      proposal_id:
        proposal.proposal_id ||
        (proposal.decision_payload ? proposal.decision_payload.proposal_id : null),
      metadata
    };
  } catch (error) {
    console.error("Approval workflow could not parse proposed dispatch command:", error);
    return {
      status: "invalid",
      error: error.message,
      metadata
    };
  }
}

async function startProposedConsumer({
  consumer,
  proposedTopic = "dispatch.command.proposed"
}) {
  await consumer.subscribe({
    topic: proposedTopic,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const result = await processProposedMessage({ topic, partition, message });
        console.log(`Approval workflow observed proposed dispatch command with status ${result.status}`);
      } catch (error) {
        console.error("Approval workflow failed while observing proposed dispatch command:", error);
      }
    }
  });
}

module.exports = {
  buildKafkaMetadata,
  createKafka,
  getKafkaBrokers,
  processProposedMessage,
  publishApprovalAudit,
  publishReadyCommand,
  startProposedConsumer
};
