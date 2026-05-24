"use strict";

const express = require("express");
const {
  createPool,
  ensureDeviceCommandAuditTable,
  listDeviceCommandAudit
} = require("./db");
const { listDevices } = require("./device-registry");
const { createKafka, startReadyConsumer } = require("./kafka");

const PORT = Number(process.env.DEVICE_COMMAND_TRANSLATOR_PORT || process.env.PORT || 3009);
const DISPATCH_READY_TOPIC = process.env.DISPATCH_READY_TOPIC || "dispatch.command.ready";
const DEVICE_COMMAND_RESULT_TOPIC =
  process.env.DEVICE_COMMAND_RESULT_TOPIC || "device.command.result";
const DEVICE_COMMAND_AUDIT_TOPIC =
  process.env.DEVICE_COMMAND_AUDIT_TOPIC || "device.command.audit";
const DEVICE_COMMAND_TRANSLATOR_GROUP_ID =
  process.env.DEVICE_COMMAND_TRANSLATOR_GROUP_ID || "adflex-device-command-translator";
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";

function safeAuditRow(row) {
  return {
    id: row.id,
    event_time: row.event_time,
    command_id: row.command_id,
    proposal_id: row.proposal_id,
    device_id: row.device_id,
    device_type: row.device_type,
    provider: row.provider,
    community_id: row.community_id,
    area_id: row.area_id,
    requested_reduction_kw: row.requested_reduction_kw,
    allocated_reduction_kw: row.allocated_reduction_kw,
    action: row.action,
    translated_command: row.translated_command,
    simulated_response: row.simulated_response,
    execution_mode: row.execution_mode,
    no_real_execution: row.no_real_execution,
    status: row.status,
    correlation_id: row.correlation_id,
    created_at: row.created_at
  };
}

function createApp({ pool } = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "device-command-translator",
      mode: "simulated_device_api_translation",
      consumes: DISPATCH_READY_TOPIC,
      publishes: {
        result: DEVICE_COMMAND_RESULT_TOPIC,
        audit: DEVICE_COMMAND_AUDIT_TOPIC
      },
      supported_devices: listDevices().map((device) => ({
        device_id: device.device_id,
        device_type: device.device_type,
        provider: device.provider || null,
        area_id: device.area_id
      })),
      real_device_control: false,
      no_real_execution: true
    });
  });

  app.get("/device-command/audit", async (request, response) => {
    try {
      const rows = await listDeviceCommandAudit(pool, request.query.limit);
      return response.json({
        status: "ok",
        count: rows.length,
        audit: rows.map(safeAuditRow)
      });
    } catch (error) {
      console.error("Could not list device command audit rows:", error);
      return response.status(503).json({
        error: "device_command_audit_unavailable",
        message: "Device command audit rows could not be read."
      });
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled device command translator API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected device command translator API error."
    });
  });

  return app;
}

async function start() {
  const kafka = createKafka();
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: DEVICE_COMMAND_TRANSLATOR_GROUP_ID });
  const pool = createPool();

  await ensureDeviceCommandAuditTable(pool);
  await producer.connect();
  await consumer.connect();

  const app = createApp({ pool });
  const server = app.listen(PORT, () => {
    console.log(`Device command translator listening on http://0.0.0.0:${PORT}`);
    console.log(`Consuming approved ready commands from ${DISPATCH_READY_TOPIC}`);
    console.log(`Publishing device command results to ${DEVICE_COMMAND_RESULT_TOPIC}`);
    console.log(`Publishing device command audit records to ${DEVICE_COMMAND_AUDIT_TOPIC}`);
    console.log("Real Shelly and Enode/Easee device control is disabled.");
  });

  await startReadyConsumer({
    consumer,
    pool,
    producer,
    readyTopic: DISPATCH_READY_TOPIC,
    resultTopic: DEVICE_COMMAND_RESULT_TOPIC,
    auditTopic: DEVICE_COMMAND_AUDIT_TOPIC
  });

  const shutdown = async () => {
    console.log("Shutting down device command translator...");
    server.close();
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
    console.error("Device command translator failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  safeAuditRow,
  start
};
