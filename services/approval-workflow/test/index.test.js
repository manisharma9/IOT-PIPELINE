"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/index");

function proposalRow(overrides = {}) {
  return {
    id: 1,
    event_time: "2026-05-24T18:00:00.000Z",
    created_at: "2026-05-24T17:56:00.000Z",
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
    correlation_id: "signal-001",
    decision_payload: {
      proposal_id: "proposal-signal-001",
      no_execution: true
    },
    audit_payload: {
      no_execution: true
    },
    ...overrides
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("HTTP health endpoint works", async () => {
  const app = createApp({
    pool: {
      query: async () => ({ rows: [] })
    },
    producer: {}
  });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "approval-workflow");
    assert.equal(body.command_execution_enabled, false);
    assert.equal(body.publishes.ready, "dispatch.command.ready");
  } finally {
    await close(server);
  }
});

test("GET proposals endpoint works", async () => {
  const app = createApp({
    pool: {
      query: async () => ({ rows: [proposalRow()] })
    },
    producer: {}
  });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/approvals/proposals`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.count, 1);
    assert.equal(body.proposals[0].status, "proposed");
    assert.equal(body.proposals[0].proposed_action, "reduce_ev_charging");
  } finally {
    await close(server);
  }
});
