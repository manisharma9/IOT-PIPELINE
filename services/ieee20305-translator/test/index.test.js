"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/index");

function gridSignal(overrides = {}) {
  return {
    signal_id: "signal-001",
    dso_id: "dso-dublin",
    community_id: "community-dublin-north",
    signal_type: "curtailment_request",
    severity: "medium",
    requested_action: "reduce_load",
    start_time: "2026-05-24T18:00:00Z",
    end_time: "2026-05-24T19:00:00Z",
    reason: "Local transformer load is approaching threshold",
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

test("POST /dso/grid-signal accepts valid grid signal", async () => {
  const dbWrites = [];
  const kafkaWrites = [];
  const app = createApp({
    pool: {
      query: async (sql, params) => {
        dbWrites.push({ sql, params });
      }
    },
    producer: {
      send: async (message) => {
        kafkaWrites.push(message);
      }
    },
    gridSignalsTopic: "grid.signals"
  });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dso/grid-signal`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(gridSignal())
    });
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.status, "accepted");
    assert.equal(body.topic, "grid.signals");
    assert.equal(body.resource_type, "GridSignal");
    assert.equal(dbWrites.length, 1);
    assert.equal(kafkaWrites.length, 1);
    assert.equal(kafkaWrites[0].topic, "grid.signals");
  } finally {
    await close(server);
  }
});

test("POST /dso/grid-signal returns 400 for invalid grid signal", async () => {
  const app = createApp({
    pool: {
      query: async () => undefined
    },
    producer: {
      send: async () => undefined
    }
  });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dso/grid-signal`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(gridSignal({ requested_action: "disconnect_households" }))
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "invalid_grid_signal");
    assert.equal(Array.isArray(body.details), true);
    assert.equal(body.details.some((error) => error.includes("requested_action")), true);
  } finally {
    await close(server);
  }
});
