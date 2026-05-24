"use strict";

const express = require("express");
const {
  createPool,
  ensureDispatchExecutionAuditTable,
  getDispatchExecutionAuditById,
  listDispatchExecutionAudit
} = require("./db");
const { createKafka, startReadyConsumer } = require("./kafka");

const PORT = Number(process.env.MOCK_DISPATCH_ADAPTER_PORT || process.env.PORT || 3005);
const DISPATCH_READY_TOPIC = process.env.DISPATCH_READY_TOPIC || "dispatch.command.ready";
const DISPATCH_MOCK_SENT_TOPIC =
  process.env.DISPATCH_MOCK_SENT_TOPIC || "dispatch.command.mock.sent";
const DISPATCH_MOCK_RESULT_TOPIC =
  process.env.DISPATCH_MOCK_RESULT_TOPIC || "dispatch.command.mock.result";
const DISPATCH_MOCK_AUDIT_TOPIC = process.env.DISPATCH_MOCK_AUDIT_TOPIC || "dispatch.mock.audit";
const MOCK_DISPATCH_GROUP_ID =
  process.env.MOCK_DISPATCH_GROUP_ID || "adflex-mock-dispatch-adapter";
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";

function safeAuditRow(row) {
  return {
    id: row.id,
    event_time: row.event_time,
    created_at: row.created_at,
    dispatch_command_id: row.dispatch_command_id,
    proposal_id: row.proposal_id,
    community_id: row.community_id,
    household_id: row.household_id,
    device_id: row.device_id,
    requested_action: row.requested_action,
    proposed_action: row.proposed_action,
    mock_device_type: row.mock_device_type,
    simulation_status: row.simulation_status,
    simulation_message: row.simulation_message,
    no_real_execution: row.no_real_execution,
    execution_mode: row.execution_mode,
    mock_command_payload: row.mock_command_payload,
    mock_result_payload: row.mock_result_payload,
    audit_payload: row.audit_payload,
    correlation_id: row.correlation_id
  };
}

function createApp({ pool } = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "mock-dispatch-adapter",
      execution_mode: "mock",
      real_device_control: false,
      message: "Real execution is disabled. This service only simulates mock dispatch preparation.",
      consumes: DISPATCH_READY_TOPIC,
      publishes: {
        mock_sent: DISPATCH_MOCK_SENT_TOPIC,
        mock_result: DISPATCH_MOCK_RESULT_TOPIC,
        mock_audit: DISPATCH_MOCK_AUDIT_TOPIC
      }
    });
  });

  app.get("/mock-dispatch/audit", async (request, response) => {
    try {
      const rows = await listDispatchExecutionAudit(pool, request.query.limit);
      return response.json({
        status: "ok",
        count: rows.length,
        audit: rows.map(safeAuditRow)
      });
    } catch (error) {
      console.error("Could not list mock dispatch audit rows:", error);
      return response.status(503).json({
        error: "mock_dispatch_audit_unavailable",
        message: "Mock dispatch audit rows could not be read."
      });
    }
  });

  app.get("/mock-dispatch/audit/:id", async (request, response) => {
    try {
      const row = await getDispatchExecutionAuditById(pool, request.params.id);
      if (!row) {
        return response.status(404).json({
          error: "mock_dispatch_audit_not_found"
        });
      }

      return response.json({
        status: "ok",
        audit: safeAuditRow(row)
      });
    } catch (error) {
      console.error("Could not read mock dispatch audit row:", error);
      return response.status(503).json({
        error: "mock_dispatch_audit_unavailable",
        message: "Mock dispatch audit row could not be read."
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

    console.error("Unhandled mock dispatch adapter API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected mock dispatch adapter API error."
    });
  });

  return app;
}

async function start() {
  const kafka = createKafka();
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: MOCK_DISPATCH_GROUP_ID });
  const pool = createPool();

  await ensureDispatchExecutionAuditTable(pool);
  await producer.connect();
  await consumer.connect();

  const app = createApp({ pool });
  const server = app.listen(PORT, () => {
    console.log(`Mock dispatch adapter listening on http://0.0.0.0:${PORT}`);
    console.log(`Consuming ready events from ${DISPATCH_READY_TOPIC}`);
    console.log(`Publishing mock sent events to ${DISPATCH_MOCK_SENT_TOPIC}`);
    console.log(`Publishing mock result events to ${DISPATCH_MOCK_RESULT_TOPIC}`);
    console.log(`Publishing mock audit events to ${DISPATCH_MOCK_AUDIT_TOPIC}`);
    console.log("Real device control is disabled in Phase 7.");
  });

  await startReadyConsumer({
    consumer,
    pool,
    producer,
    readyTopic: DISPATCH_READY_TOPIC,
    sentTopic: DISPATCH_MOCK_SENT_TOPIC,
    resultTopic: DISPATCH_MOCK_RESULT_TOPIC,
    auditTopic: DISPATCH_MOCK_AUDIT_TOPIC
  });

  const shutdown = async () => {
    console.log("Shutting down mock dispatch adapter...");
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
    console.error("Mock dispatch adapter failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  safeAuditRow,
  start
};
