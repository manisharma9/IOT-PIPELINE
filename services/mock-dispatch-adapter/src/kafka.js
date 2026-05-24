"use strict";

const { Kafka } = require("kafkajs");
const {
  buildAuditPayload,
  buildMockCommandPayload,
  buildMockResultPayload,
  buildRejectedAuditPayload
} = require("./mock-adapter");
const { safeInsertDispatchExecutionAudit } = require("./db");
const { validateReadyEvent } = require("./validation");

function getKafkaBrokers(env = process.env) {
  const brokerValue = env.KAFKA_BROKERS || env.KAFKA_BROKER || "localhost:9092";

  return brokerValue
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function createKafka(env = process.env) {
  return new Kafka({
    clientId: env.KAFKA_CLIENT_ID || "adflex-mock-dispatch-adapter",
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

async function publishMockSent(producer, topic, payload) {
  await publishJson(
    producer,
    topic,
    payload,
    [payload.community_id || "community", payload.proposal_id || "proposal", "mock-sent"].join("/")
  );
}

async function publishMockResult(producer, topic, payload) {
  await publishJson(
    producer,
    topic,
    payload,
    [payload.community_id || "community", payload.proposal_id || "proposal", "mock-result"].join("/")
  );
}

async function publishMockAudit(producer, topic, payload) {
  await publishJson(
    producer,
    topic,
    payload,
    [payload.community_id || "community", payload.proposal_id || "proposal", payload.simulation_status].join("/")
  );
}

function buildAuditRow({ commandPayload, resultPayload, auditPayload, readyEvent, createdAt }) {
  return {
    event_time: auditPayload.event_time,
    created_at: createdAt || auditPayload.event_time,
    dispatch_command_id: auditPayload.dispatch_command_id,
    proposal_id: auditPayload.proposal_id,
    community_id: auditPayload.community_id,
    household_id: auditPayload.household_id,
    device_id: auditPayload.device_id,
    requested_action: auditPayload.requested_action,
    proposed_action: auditPayload.proposed_action,
    mock_device_type: auditPayload.mock_device_type,
    mock_command_payload: commandPayload,
    mock_result_payload: resultPayload,
    simulation_status: auditPayload.simulation_status,
    simulation_message: auditPayload.simulation_message,
    no_real_execution: true,
    execution_mode: "mock",
    source_ready_event: readyEvent,
    audit_payload: auditPayload,
    correlation_id: auditPayload.correlation_id
  };
}

function buildRejectedAuditRow({ readyEvent, auditPayload, createdAt }) {
  return buildAuditRow({
    commandPayload: {
      simulated: true,
      no_real_execution: true,
      execution_mode: "mock",
      command_created: false,
      reason: auditPayload.simulation_message
    },
    resultPayload: {
      simulated: true,
      no_real_execution: true,
      execution_mode: "mock",
      simulation_status: auditPayload.simulation_status,
      message: auditPayload.simulation_message
    },
    auditPayload,
    readyEvent,
    createdAt
  });
}

async function processReadyMessage({
  topic,
  partition,
  message,
  pool,
  producer,
  sentTopic = "dispatch.command.mock.sent",
  resultTopic = "dispatch.command.mock.result",
  auditTopic = "dispatch.mock.audit",
  eventTime
}) {
  const rawMessage = message && message.value ? message.value.toString("utf8") : "";
  let readyEvent;

  try {
    readyEvent = JSON.parse(rawMessage);
  } catch (error) {
    readyEvent = {
      parse_error: error.message,
      raw_message: rawMessage,
      correlation_id: `${topic}:${partition}:${message && message.offset ? message.offset : "unknown"}`
    };
  }

  const validation = validateReadyEvent(readyEvent);
  if (!validation.valid) {
    const auditPayload = buildRejectedAuditPayload(readyEvent, validation.errors, { eventTime });
    const auditRow = buildRejectedAuditRow({
      readyEvent,
      auditPayload,
      createdAt: eventTime || auditPayload.event_time
    });

    await safeInsertDispatchExecutionAudit(pool, auditRow);
    await publishMockAudit(producer, auditTopic, auditPayload);

    return {
      status: "rejected",
      errors: validation.errors,
      audit: auditPayload
    };
  }

  const commandPayload = buildMockCommandPayload(validation.value, { eventTime });
  const resultPayload = buildMockResultPayload(commandPayload, { eventTime });
  const auditPayload = buildAuditPayload(commandPayload, resultPayload, { eventTime });
  const auditRow = buildAuditRow({
    commandPayload,
    resultPayload,
    auditPayload,
    readyEvent: validation.value,
    createdAt: eventTime || auditPayload.event_time
  });

  const stored = await safeInsertDispatchExecutionAudit(pool, auditRow);
  if (!stored) {
    return {
      status: "error",
      error: "database_insert_failed"
    };
  }

  await publishMockSent(producer, sentTopic, commandPayload);
  await publishMockResult(producer, resultTopic, resultPayload);
  await publishMockAudit(producer, auditTopic, auditPayload);

  return {
    status: "simulated",
    command: commandPayload,
    result: resultPayload,
    audit: auditPayload
  };
}

async function startReadyConsumer({
  consumer,
  pool,
  producer,
  readyTopic = "dispatch.command.ready",
  sentTopic = "dispatch.command.mock.sent",
  resultTopic = "dispatch.command.mock.result",
  auditTopic = "dispatch.mock.audit"
}) {
  await consumer.subscribe({
    topic: readyTopic,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const result = await processReadyMessage({
          topic,
          partition,
          message,
          pool,
          producer,
          sentTopic,
          resultTopic,
          auditTopic
        });

        console.log(`Mock dispatch adapter handled ready event with status ${result.status}`);
      } catch (error) {
        console.error("Mock dispatch adapter failed to process ready event:", error);
      }
    }
  });
}

module.exports = {
  buildAuditRow,
  buildRejectedAuditRow,
  createKafka,
  getKafkaBrokers,
  processReadyMessage,
  publishMockAudit,
  publishMockResult,
  publishMockSent,
  startReadyConsumer
};
