"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applyApprovalAction } = require("../src/workflow");

function dispatchCommand(overrides = {}) {
  return {
    id: 1,
    event_time: "2026-05-24T18:00:00.000Z",
    created_at: "2026-05-24T17:56:00.000Z",
    source_topic: "grid.signals",
    output_topic: "dispatch.command.proposed",
    signal_id: "signal-001",
    dso_id: "dso-dublin",
    community_id: "community-dublin-north",
    household_id: null,
    device_id: null,
    proposal_type: "load_reduction",
    requested_action: "reduce_load",
    proposed_action: "reduce_ev_charging",
    target_kw: 2.5,
    start_time: "2026-05-24T18:00:00.000Z",
    end_time: "2026-05-24T19:00:00.000Z",
    priority: "medium",
    status: "proposed",
    reason: "Reduce flexible EV charging demand during the grid signal window.",
    decision_payload: {
      proposal_id: "proposal-signal-001"
    },
    audit_payload: {
      proposal_id: "proposal-signal-001",
      no_execution: true
    },
    correlation_id: "signal-001",
    ...overrides
  };
}

function approvalBody(overrides = {}) {
  return {
    reviewer_id: "paolo",
    reviewer_role: "mentor",
    comment: "Approved for safe dispatch preparation only.",
    ...overrides
  };
}

function fakePool(initialRow) {
  let row = initialRow ? { ...initialRow } : null;
  const auditRows = [];

  return {
    auditRows,
    get row() {
      return row;
    },
    query: async (sql, params) => {
      if (sql.includes("SELECT *") && sql.includes("FROM dispatch_commands")) {
        return { rows: row && String(row.id) === String(params[0]) ? [row] : [] };
      }

      if (sql.includes("UPDATE dispatch_commands")) {
        if (!row || String(row.id) !== String(params[0]) || row.status !== params[1]) {
          return { rows: [] };
        }

        row = {
          ...row,
          status: params[2],
          audit_payload: JSON.parse(params[3])
        };

        return { rows: [row] };
      }

      if (sql.includes("INSERT INTO dispatch_approval_audit")) {
        const audit = {
          id: auditRows.length + 1,
          event_time: params[0],
          created_at: params[1]
        };
        auditRows.push({ audit, params });
        return { rows: [audit] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };
}

async function runAction(status, action, body = approvalBody()) {
  const pool = fakePool(dispatchCommand({ status }));
  const auditWrites = [];
  const readyWrites = [];

  const result = await applyApprovalAction({
    pool,
    producer: {},
    dispatchCommandId: 1,
    action,
    body,
    publishApprovalAudit: async (_producer, topic, payload) => {
      auditWrites.push({ topic, payload });
    },
    publishReadyCommand: async (_producer, topic, payload) => {
      readyWrites.push({ topic, payload });
    },
    eventTime: "2026-05-24T18:05:00.000Z"
  });

  return {
    result,
    pool,
    auditWrites,
    readyWrites
  };
}

test("workflow review changes proposed to reviewed", async () => {
  const { result, pool } = await runAction("proposed", "review");

  assert.equal(result.ok, true);
  assert.equal(result.new_status, "reviewed");
  assert.equal(pool.row.status, "reviewed");
});

test("workflow approve changes reviewed to approved", async () => {
  const { result, pool } = await runAction("reviewed", "approve");

  assert.equal(result.ok, true);
  assert.equal(result.new_status, "approved");
  assert.equal(pool.row.status, "approved");
});

test("workflow reject changes proposed to rejected", async () => {
  const { result, pool } = await runAction(
    "proposed",
    "reject",
    approvalBody({ comment: "Rejected because more evidence is required." })
  );

  assert.equal(result.ok, true);
  assert.equal(result.new_status, "rejected");
  assert.equal(pool.row.status, "rejected");
});

test("workflow mark-ready publishes dispatch.command.ready payload with no_execution true", async () => {
  const { result, readyWrites } = await runAction("approved", "mark_ready");

  assert.equal(result.ok, true);
  assert.equal(result.new_status, "ready_to_dispatch");
  assert.equal(readyWrites.length, 1);
  assert.equal(readyWrites[0].topic, "dispatch.command.ready");
  assert.equal(readyWrites[0].payload.no_execution, true);
  assert.equal(readyWrites[0].payload.execution_blocked, true);
  assert.match(readyWrites[0].payload.message, /No device command executed/);
});

test("workflow creates approval audit payload", async () => {
  const { result, auditWrites, pool } = await runAction("proposed", "review");

  assert.equal(result.ok, true);
  assert.equal(auditWrites.length, 1);
  assert.equal(pool.auditRows.length, 1);
  assert.equal(result.audit.audit_payload.no_execution, true);
  assert.equal(result.audit.new_status, "reviewed");
});

test("workflow rejects invalid proposed directly to approved transition", async () => {
  const { result } = await runAction("proposed", "approve");

  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 400);
  assert.equal(result.error, "invalid_status_transition");
});
