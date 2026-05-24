"use strict";

const express = require("express");
const {
  createPool,
  ensureDispatchApprovalAuditTable,
  getDispatchCommandById,
  listDispatchCommands
} = require("./db");
const {
  createKafka,
  publishApprovalAudit,
  publishReadyCommand,
  startProposedConsumer
} = require("./kafka");
const { ALLOWED_TRANSITIONS } = require("./status-machine");
const { applyApprovalAction } = require("./workflow");

const PORT = Number(process.env.APPROVAL_WORKFLOW_PORT || process.env.PORT || 3004);
const DISPATCH_PROPOSED_TOPIC =
  process.env.DISPATCH_PROPOSED_TOPIC || "dispatch.command.proposed";
const DISPATCH_READY_TOPIC = process.env.DISPATCH_READY_TOPIC || "dispatch.command.ready";
const DISPATCH_APPROVAL_AUDIT_TOPIC =
  process.env.DISPATCH_APPROVAL_AUDIT_TOPIC || "dispatch.approval.audit";
const APPROVAL_WORKFLOW_GROUP_ID =
  process.env.APPROVAL_WORKFLOW_GROUP_ID || "adflex-approval-workflow";
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
  producer,
  proposedTopic = DISPATCH_PROPOSED_TOPIC,
  readyTopic = DISPATCH_READY_TOPIC,
  approvalAuditTopic = DISPATCH_APPROVAL_AUDIT_TOPIC
} = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "approval-workflow",
      mode: "approval_and_dispatch_preparation_only",
      consumes: proposedTopic,
      publishes: {
        audit: approvalAuditTopic,
        ready: readyTopic
      },
      allowed_transitions: ALLOWED_TRANSITIONS,
      command_execution_enabled: false
    });
  });

  app.get("/approvals/proposals", async (request, response) => {
    try {
      const rows = await listDispatchCommands(pool, request.query.limit);
      return response.json({
        status: "ok",
        count: rows.length,
        proposals: rows.map(safeProposalRow)
      });
    } catch (error) {
      console.error("Could not list approval proposals:", error);
      return response.status(503).json({
        error: "approval_proposals_unavailable",
        message: "Approval proposals could not be read."
      });
    }
  });

  app.get("/approvals/proposals/:id", async (request, response) => {
    try {
      const row = await getDispatchCommandById(pool, request.params.id);
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
      console.error("Could not read approval proposal:", error);
      return response.status(503).json({
        error: "approval_proposal_unavailable",
        message: "Approval proposal could not be read."
      });
    }
  });

  function transitionHandler(action) {
    return async (request, response) => {
      try {
        const result = await applyApprovalAction({
          pool,
          producer,
          dispatchCommandId: request.params.id,
          action,
          body: request.body,
          publishApprovalAudit,
          publishReadyCommand,
          auditTopic: approvalAuditTopic,
          readyTopic
        });

        if (!result.ok) {
          return response.status(result.httpStatus).json(result);
        }

        return response.json({
          status: result.status,
          previous_status: result.previous_status,
          new_status: result.new_status,
          proposal: safeProposalRow(result.proposal),
          audit: result.audit.audit_payload,
          ready_event: result.ready_event
        });
      } catch (error) {
        console.error(`Could not apply approval action ${action}:`, error);
        return response.status(503).json({
          error: "approval_action_failed",
          message: "Approval action could not be completed safely."
        });
      }
    };
  }

  app.post("/approvals/proposals/:id/review", transitionHandler("review"));
  app.post("/approvals/proposals/:id/approve", transitionHandler("approve"));
  app.post("/approvals/proposals/:id/reject", transitionHandler("reject"));
  app.post("/approvals/proposals/:id/mark-ready", transitionHandler("mark_ready"));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled approval workflow API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected approval workflow API error."
    });
  });

  return app;
}

async function start() {
  const kafka = createKafka();
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: APPROVAL_WORKFLOW_GROUP_ID });
  const pool = createPool();

  await ensureDispatchApprovalAuditTable(pool);
  await producer.connect();
  await consumer.connect();

  const app = createApp({
    pool,
    producer,
    proposedTopic: DISPATCH_PROPOSED_TOPIC,
    readyTopic: DISPATCH_READY_TOPIC,
    approvalAuditTopic: DISPATCH_APPROVAL_AUDIT_TOPIC
  });

  const server = app.listen(PORT, () => {
    console.log(`Approval workflow listening on http://0.0.0.0:${PORT}`);
    console.log(`Observing dispatch proposals from ${DISPATCH_PROPOSED_TOPIC}`);
    console.log(`Publishing approval audit records to ${DISPATCH_APPROVAL_AUDIT_TOPIC}`);
    console.log(`Publishing ready proposals to ${DISPATCH_READY_TOPIC}`);
    console.log("Command execution is disabled in Phase 6.");
  });

  await startProposedConsumer({
    consumer,
    proposedTopic: DISPATCH_PROPOSED_TOPIC
  });

  const shutdown = async () => {
    console.log("Shutting down approval workflow...");
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
    console.error("Approval workflow failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  safeProposalRow,
  start
};
