"use strict";

const express = require("express");
const {
  createPool,
  ensureDispatchCommandsTable,
  getDispatchProposalById,
  listDispatchProposals
} = require("./db");
const { createKafka, startGridSignalConsumer } = require("./kafka");

const PORT = Number(process.env.AGGREGATOR_PORT || process.env.PORT || 3003);
const GRID_SIGNALS_TOPIC = process.env.GRID_SIGNALS_TOPIC || "grid.signals";
const IEEE20305_TRANSLATED_TOPIC =
  process.env.IEEE20305_TRANSLATED_TOPIC || "ieee20305.translated";
const DISPATCH_PROPOSED_TOPIC =
  process.env.DISPATCH_PROPOSED_TOPIC || "dispatch.command.proposed";
const DISPATCH_AUDIT_TOPIC = process.env.DISPATCH_AUDIT_TOPIC || "dispatch.command.audit";
const AGGREGATOR_GROUP_ID = process.env.AGGREGATOR_GROUP_ID || "adflex-aggregator";
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";

function safeProposalRow(row) {
  return {
    id: row.id,
    event_time: row.event_time,
    created_at: row.created_at,
    signal_id: row.signal_id,
    dso_id: row.dso_id,
    community_id: row.community_id,
    household_id: row.household_id,
    device_id: row.device_id,
    proposal_type: row.proposal_type,
    requested_action: row.requested_action,
    proposed_action: row.proposed_action,
    target_kw: row.target_kw,
    start_time: row.start_time,
    end_time: row.end_time,
    priority: row.priority,
    status: row.status,
    reason: row.reason,
    correlation_id: row.correlation_id,
    decision_payload: row.decision_payload,
    audit_payload: row.audit_payload
  };
}

function createApp({
  pool,
  gridSignalsTopic = GRID_SIGNALS_TOPIC,
  ieee20305TranslatedTopic = IEEE20305_TRANSLATED_TOPIC,
  proposedTopic = DISPATCH_PROPOSED_TOPIC,
  auditTopic = DISPATCH_AUDIT_TOPIC
} = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "aggregator",
      mode: "proposal_only",
      consumes: {
        grid_signals: gridSignalsTopic,
        ieee20305_context: ieee20305TranslatedTopic
      },
      publishes: {
        proposals: proposedTopic,
        audit: auditTopic
      },
      command_execution_enabled: false
    });
  });

  app.get("/dispatch/proposals", async (request, response) => {
    try {
      const rows = await listDispatchProposals(pool, request.query.limit);
      return response.json({
        status: "ok",
        count: rows.length,
        proposals: rows.map(safeProposalRow)
      });
    } catch (error) {
      console.error("Could not list dispatch proposals:", error);
      return response.status(503).json({
        error: "dispatch_proposals_unavailable",
        message: "Dispatch proposals could not be read."
      });
    }
  });

  app.get("/dispatch/proposals/:id", async (request, response) => {
    try {
      const row = await getDispatchProposalById(pool, request.params.id);
      if (!row) {
        return response.status(404).json({
          error: "dispatch_proposal_not_found"
        });
      }

      return response.json({
        status: "ok",
        proposal: safeProposalRow(row)
      });
    } catch (error) {
      console.error("Could not read dispatch proposal:", error);
      return response.status(503).json({
        error: "dispatch_proposal_unavailable",
        message: "Dispatch proposal could not be read."
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

    console.error("Unhandled aggregator API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected aggregator API error."
    });
  });

  return app;
}

async function start() {
  const kafka = createKafka();
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: AGGREGATOR_GROUP_ID });
  const pool = createPool();

  await ensureDispatchCommandsTable(pool);
  await producer.connect();
  await consumer.connect();

  const app = createApp({
    pool,
    gridSignalsTopic: GRID_SIGNALS_TOPIC,
    ieee20305TranslatedTopic: IEEE20305_TRANSLATED_TOPIC,
    proposedTopic: DISPATCH_PROPOSED_TOPIC,
    auditTopic: DISPATCH_AUDIT_TOPIC
  });

  const server = app.listen(PORT, () => {
    console.log(`Aggregator listening on http://0.0.0.0:${PORT}`);
    console.log(`Consuming grid signals from ${GRID_SIGNALS_TOPIC}`);
    console.log(`Publishing dispatch proposals to ${DISPATCH_PROPOSED_TOPIC}`);
    console.log(`Publishing dispatch audit records to ${DISPATCH_AUDIT_TOPIC}`);
    console.log("Command execution is disabled in Phase 5.");
  });

  await startGridSignalConsumer({
    consumer,
    pool,
    producer,
    gridSignalsTopic: GRID_SIGNALS_TOPIC,
    proposedTopic: DISPATCH_PROPOSED_TOPIC,
    auditTopic: DISPATCH_AUDIT_TOPIC
  });

  const shutdown = async () => {
    console.log("Shutting down aggregator...");
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
    console.error("Aggregator failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  safeProposalRow,
  start
};
