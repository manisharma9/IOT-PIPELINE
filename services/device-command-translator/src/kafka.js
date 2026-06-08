"use strict";

const { Kafka } = require("kafkajs");
const {
  buildAuditPayload,
  buildRejectedAuditPayload,
  buildResultPayload,
  translateReadyCommand
} = require("./translator");
const { safeInsertDeviceCommandAudit } = require("./db");

function getKafkaBrokers(env = process.env) {
  const brokerValue = env.KAFKA_BROKERS || env.KAFKA_BROKER || "localhost:9092";

  return brokerValue
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function createKafka(env = process.env) {
  return new Kafka({
    clientId: env.KAFKA_CLIENT_ID || "adflex-device-command-translator",
    brokers: getKafkaBrokers(env)
  });
}

function resolveSimulatorBaseUrl(command, env = process.env) {
  if (command.provider === "enode") {
    return env.ENODE_SIMULATOR_URL || "http://localhost:3008";
  }

  if (command.provider === "heat_pump_simulator") {
    return env.HEAT_PUMP_SIMULATOR_URL || "http://localhost:3011";
  }

  return env.SHELLY_SIMULATOR_URL || "http://localhost:3007";
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

async function publishDeviceCommandResult(producer, topic, payload) {
  await publishJson(
    producer,
    topic,
    payload,
    [payload.community_id || "community", payload.device_id || "device", payload.status].join("/")
  );
}

async function publishDeviceCommandAudit(producer, topic, payload) {
  await publishJson(
    producer,
    topic,
    payload,
    [payload.community_id || "community", payload.device_id || "device", payload.status].join("/")
  );
}

async function sendDeviceCommand(command, env = process.env) {
  const baseUrl = resolveSimulatorBaseUrl(command, env);
  const response = await fetch(`${baseUrl}${command.endpoint.path}`, {
    method: command.endpoint.method,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(command.payload)
  });
  const body = await response.json();

  return {
    ...body,
    http_status: response.status
  };
}

function buildAuditRowFromResult(resultPayload, createdAt) {
  return {
    event_time: resultPayload.event_time,
    command_id: resultPayload.command_id,
    proposal_id: resultPayload.proposal_id,
    device_id: resultPayload.device_id,
    device_type: resultPayload.device_type,
    provider: resultPayload.provider,
    community_id: resultPayload.community_id,
    area_id: resultPayload.area_id,
    requested_reduction_kw: resultPayload.requested_reduction_kw,
    allocated_reduction_kw: resultPayload.allocated_reduction_kw,
    action: resultPayload.action,
    translated_command: resultPayload.translated_command,
    simulated_response: resultPayload.simulated_response,
    execution_mode: resultPayload.execution_mode,
    no_real_execution: true,
    status: resultPayload.status,
    correlation_id: resultPayload.correlation_id,
    created_at: createdAt || resultPayload.event_time
  };
}

function buildRejectedAuditRow(auditPayload, createdAt) {
  return {
    event_time: auditPayload.event_time,
    command_id: null,
    proposal_id: auditPayload.proposal_id,
    device_id: null,
    device_type: null,
    provider: null,
    community_id: auditPayload.community_id,
    area_id: auditPayload.area_id,
    requested_reduction_kw: null,
    allocated_reduction_kw: null,
    action: null,
    translated_command: {
      simulated: true,
      no_real_execution: true,
      command_created: false,
      validation_errors: auditPayload.validation_errors
    },
    simulated_response: {
      simulated: true,
      no_real_execution: true,
      accepted: false,
      status: "rejected"
    },
    execution_mode: auditPayload.execution_mode,
    no_real_execution: true,
    status: "rejected",
    correlation_id: auditPayload.correlation_id,
    created_at: createdAt || auditPayload.event_time
  };
}

async function processReadyMessage({
  topic,
  partition,
  message,
  pool,
  producer,
  resultTopic = "device.command.result",
  auditTopic = "device.command.audit",
  commandSender = sendDeviceCommand,
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

  const translated = translateReadyCommand(readyEvent, { eventTime });
  if (!translated.valid) {
    const auditPayload = buildRejectedAuditPayload(readyEvent, translated.errors, { eventTime });
    const auditRow = buildRejectedAuditRow(auditPayload, eventTime || auditPayload.event_time);
    await safeInsertDeviceCommandAudit(pool, auditRow);
    await publishDeviceCommandAudit(producer, auditTopic, auditPayload);

    return {
      status: "rejected",
      errors: translated.errors,
      audit: auditPayload
    };
  }

  const results = [];
  for (const command of translated.commands) {
    let simulatedResponse;
    try {
      simulatedResponse = await commandSender(command);
    } catch (error) {
      simulatedResponse = {
        accepted: false,
        simulated: true,
        no_real_execution: true,
        execution_mode: command.execution_mode,
        error: "simulator_unavailable",
        message: error.message
      };
    }

    const resultPayload = buildResultPayload(command, simulatedResponse, { eventTime });
    const auditPayload = buildAuditPayload(resultPayload);
    const auditRow = buildAuditRowFromResult(resultPayload, eventTime || resultPayload.event_time);

    await safeInsertDeviceCommandAudit(pool, auditRow);
    await publishDeviceCommandResult(producer, resultTopic, resultPayload);
    await publishDeviceCommandAudit(producer, auditTopic, auditPayload);

    results.push({
      result: resultPayload,
      audit: auditPayload
    });
  }

  return {
    status: "translated",
    command_count: results.length,
    results
  };
}

async function startReadyConsumer({
  consumer,
  pool,
  producer,
  readyTopic = "dispatch.command.ready",
  resultTopic = "device.command.result",
  auditTopic = "device.command.audit"
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
          resultTopic,
          auditTopic
        });

        console.log(`Device command translator handled ready event with status ${result.status}`);
      } catch (error) {
        console.error("Device command translator failed to process ready event:", error);
      }
    }
  });
}

module.exports = {
  buildAuditRowFromResult,
  buildRejectedAuditRow,
  createKafka,
  getKafkaBrokers,
  processReadyMessage,
  publishDeviceCommandAudit,
  publishDeviceCommandResult,
  resolveSimulatorBaseUrl,
  sendDeviceCommand,
  startReadyConsumer
};
