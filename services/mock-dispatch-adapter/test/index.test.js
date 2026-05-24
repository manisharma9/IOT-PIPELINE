"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/index");

function auditRow(overrides = {}) {
  return {
    id: 1,
    event_time: "2026-05-24T18:05:00.000Z",
    created_at: "2026-05-24T18:05:00.000Z",
    dispatch_command_id: 1,
    proposal_id: "proposal-signal-001",
    community_id: "community-dublin-north",
    household_id: "household-001",
    device_id: "evse-001",
    requested_action: "reduce_load",
    proposed_action: "reduce_ev_charging",
    mock_device_type: "ev_charger",
    simulation_status: "simulated_success",
    simulation_message: "Mock dispatch simulation completed. No real household device was controlled.",
    no_real_execution: true,
    execution_mode: "mock",
    mock_command_payload: {
      simulated: true,
      no_real_execution: true,
      execution_mode: "mock"
    },
    mock_result_payload: {
      simulated: true,
      no_real_execution: true,
      execution_mode: "mock"
    },
    audit_payload: {
      simulated: true,
      no_real_execution: true,
      execution_mode: "mock"
    },
    correlation_id: "signal-001",
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

test("GET /health endpoint works", async () => {
  const app = createApp({
    pool: {
      query: async () => ({ rows: [] })
    }
  });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "mock-dispatch-adapter");
    assert.equal(body.execution_mode, "mock");
    assert.equal(body.real_device_control, false);
  } finally {
    await close(server);
  }
});

test("GET /mock-dispatch/audit returns safe response", async () => {
  const app = createApp({
    pool: {
      query: async () => ({ rows: [auditRow()] })
    }
  });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/mock-dispatch/audit`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.count, 1);
    assert.equal(body.audit[0].execution_mode, "mock");
    assert.equal(body.audit[0].no_real_execution, true);
  } finally {
    await close(server);
  }
});
