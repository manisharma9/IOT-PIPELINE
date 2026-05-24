"use strict";

const { Kafka } = require("kafkajs");
const { buildRejectedAudit, createDispatchProposal } = require("./aggregator");
const { safeInsertDispatchCommandProposal } = require("./db");
const { validateGridSignalEvent } = require("./validation");

function getKafkaBrokers(env = process.env) {
  const brokerValue = env.KAFKA_BROKERS || env.KAFKA_BROKER || "localhost:9092";

  return brokerValue
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function createKafka(env = process.env) {
  return new Kafka({
    clientId: env.KAFKA_CLIENT_ID || "adflex-aggregator",
    brokers: getKafkaBrokers(env)
  });
}

function buildMessageMetadata(topic, partition, message) {
  return {
    topic,
    partition,
    offset: message && message.offset ? Number(message.offset) : null
  };
}

function buildProposalKey(proposal) {
  return [
    proposal.community_id || "community",
    proposal.signal_id || "signal",
    proposal.proposed_action || "proposal"
  ].join("/");
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

async function publishDispatchProposal(producer, topic, proposal) {
  await publishJson(producer, topic, proposal, buildProposalKey(proposal));
}

async function publishAuditRecord(producer, topic, auditPayload) {
  await publishJson(
    producer,
    topic,
    auditPayload,
    [auditPayload.community_id || "community", auditPayload.signal_id || "signal", auditPayload.status].join("/")
  );
}

async function processGridSignalMessage({
  topic,
  partition,
  message,
  pool,
  producer,
  proposedTopic = "dispatch.command.proposed",
  auditTopic = "dispatch.command.audit",
  createdAt
}) {
  const metadata = buildMessageMetadata(topic, partition, message);
  const rawMessage = message && message.value ? message.value.toString("utf8") : "";
  let payload;

  try {
    payload = JSON.parse(rawMessage);
  } catch (error) {
    payload = {
      source_topic: topic,
      correlation_id: `${metadata.topic}:${metadata.partition}:${metadata.offset}`,
      raw_message: rawMessage,
      parse_error: error.message
    };
  }

  const validation = validateGridSignalEvent(payload);
  if (!validation.valid) {
    const audit = buildRejectedAudit(payload, validation.errors, {
      sourceTopic: topic,
      auditTopic,
      eventTime: createdAt
    });
    await publishAuditRecord(producer, auditTopic, audit);

    return {
      status: "rejected",
      errors: validation.errors,
      audit
    };
  }

  const proposal = createDispatchProposal(validation.value, {
    sourceTopic: topic,
    outputTopic: proposedTopic,
    createdAt
  });
  const stored = await safeInsertDispatchCommandProposal(pool, proposal);
  if (!stored) {
    const audit = {
      ...proposal.audit_payload,
      status: "failed",
      message: "Dispatch proposal was valid but could not be stored. No command was executed."
    };
    await publishAuditRecord(producer, auditTopic, audit);

    return {
      status: "error",
      error: "database_insert_failed",
      audit
    };
  }

  await publishDispatchProposal(producer, proposedTopic, proposal);
  await publishAuditRecord(producer, auditTopic, proposal.audit_payload);

  return {
    status: "processed",
    proposed_action: proposal.proposed_action,
    target_kw: proposal.target_kw,
    proposal
  };
}

async function startGridSignalConsumer({
  consumer,
  pool,
  producer,
  gridSignalsTopic = "grid.signals",
  proposedTopic = "dispatch.command.proposed",
  auditTopic = "dispatch.command.audit"
}) {
  await consumer.subscribe({
    topic: gridSignalsTopic,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const result = await processGridSignalMessage({
          topic,
          partition,
          message,
          pool,
          producer,
          proposedTopic,
          auditTopic
        });

        if (result.status === "processed") {
          console.log(
            `Aggregator proposed ${result.proposed_action} at ${result.target_kw} kW from ${topic}`
          );
        } else {
          console.log(`Aggregator handled ${topic} message with status ${result.status}`);
        }
      } catch (error) {
        console.error("Aggregator failed to process grid signal:", error);
      }
    }
  });
}

module.exports = {
  buildMessageMetadata,
  buildProposalKey,
  createKafka,
  getKafkaBrokers,
  processGridSignalMessage,
  publishAuditRecord,
  publishDispatchProposal,
  startGridSignalConsumer
};
