"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/index");

function semanticRow() {
  return {
    event_time: "2026-05-24T18:00:00.000Z",
    processed_at: "2026-05-24T18:00:01.000Z",
    household_id: "household-001",
    community_id: "community-dublin-north",
    device_id: "meter-001",
    device_type: "smart_meter",
    reading_name: "active_power_kw",
    reading_unit: "kW",
    saref_type: "saref:Measurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    saref4ener_concept: "ActivePower",
    ngsi_type: "Property",
    ngsi_property: "activePower",
    mapping_source: "deterministic",
    mapping_confidence: "high",
    explanation: "Known deterministic mapping.",
    correlation_id: "raw.telemetry:0:1"
  };
}

function fakePool() {
  const inserts = [];

  return {
    inserts,
    query: async (sql, params) => {
      if (sql.includes("INSERT INTO dataspace_exports")) {
        inserts.push({ sql, params });
        return {
          rows: [
            {
              id: inserts.length,
              event_time: params[0],
              created_at: params[1]
            }
          ]
        };
      }

      if (sql.includes("FROM semantic_events")) {
        return {
          rows: [semanticRow(), { ...semanticRow(), household_id: "household-002", device_id: "meter-002" }]
        };
      }

      if (sql.includes("FROM ieee20305_events")) {
        return {
          rows: [
            {
              event_time: "2026-05-24T18:00:00.000Z",
              processed_at: "2026-05-24T18:00:01.000Z",
              community_id: "community-dublin-north",
              resource_type: "GridSignal",
              signal_id: "signal-001",
              signal_type: "curtailment_request",
              severity: "medium",
              requested_action: "reduce_load",
              translation_status: "translated"
            }
          ]
        };
      }

      if (sql.includes("FROM dispatch_commands")) {
        return {
          rows: [
            {
              id: 1,
              event_time: "2026-05-24T18:00:00.000Z",
              created_at: "2026-05-24T18:00:01.000Z",
              community_id: "community-dublin-north",
              household_id: "household-001",
              device_id: "evse-001",
              requested_action: "reduce_load",
              proposed_action: "reduce_ev_charging",
              status: "ready_to_dispatch"
            }
          ]
        };
      }

      if (sql.includes("FROM dispatch_approval_audit")) {
        return {
          rows: [
            {
              event_time: "2026-05-24T18:01:00.000Z",
              created_at: "2026-05-24T18:01:01.000Z",
              dispatch_command_id: 1,
              proposal_id: "proposal-signal-001",
              previous_status: "approved",
              new_status: "ready_to_dispatch",
              action: "mark-ready",
              reviewer_role: "mentor",
              comment: "do not expose comment"
            }
          ]
        };
      }

      if (sql.includes("FROM dispatch_execution_audit")) {
        return {
          rows: [
            {
              event_time: "2026-05-24T18:02:00.000Z",
              created_at: "2026-05-24T18:02:01.000Z",
              dispatch_command_id: 1,
              proposal_id: "proposal-signal-001",
              community_id: "community-dublin-north",
              household_id: "household-001",
              device_id: "evse-001",
              requested_action: "reduce_load",
              proposed_action: "reduce_ev_charging",
              mock_device_type: "ev_charger",
              command: "set_charging_limit",
              simulation_status: "simulated_success",
              simulation_message: "Mock dispatch simulation completed.",
              no_real_execution: true,
              execution_mode: "mock"
            }
          ]
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };
}

function fakeProducer() {
  const writes = [];

  return {
    writes,
    send: async (message) => {
      writes.push(message);
    }
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

function buildApp(options = {}) {
  const pool = fakePool();
  const producer = fakeProducer();
  const app = createApp({
    pool,
    producer,
    apiKey: "test-key",
    salt: "test-salt",
    maxRecords: options.maxRecords || 1
  });

  return { app, pool, producer };
}

test("health endpoint does not require API key", async () => {
  const { app } = buildApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.service, "dataspace-export");
    assert.equal(body.api_key_required_for_exports, true);
  } finally {
    await close(server);
  }
});

test("export endpoints require API key", async () => {
  const { app } = buildApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dataspace/export/semantic-summary`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "unauthorized_dataspace_request");
  } finally {
    await close(server);
  }
});

test("wrong API key returns 401", async () => {
  const { app } = buildApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dataspace/export/semantic-summary`, {
      headers: {
        "x-api-key": "wrong"
      }
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "unauthorized_dataspace_request");
  } finally {
    await close(server);
  }
});

test("catalog endpoint returns asset metadata", async () => {
  const { app } = buildApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dataspace/catalog`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.foundation_only, true);
    assert.equal(body.enershare_certified_connector, false);
    assert.equal(body.assets.some((asset) => asset.id === "full-pipeline-demo-summary"), true);
  } finally {
    await close(server);
  }
});

test("semantic export endpoint returns minimized pseudonymized data and creates audit", async () => {
  const { app, pool, producer } = buildApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dataspace/export/semantic-summary`, {
      headers: {
        "x-api-key": "test-key"
      }
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.record_count, 1);
    assert.match(body.data[0].household_ref, /^household_[a-f0-9]{12}$/);
    assert.match(body.data[0].device_ref, /^device_[a-f0-9]{12}$/);
    assert.equal(serialized.includes("household-001"), false);
    assert.equal(serialized.includes("meter-001"), false);
    assert.equal(serialized.includes("raw_payload"), false);
    assert.equal(pool.inserts.length, 1);
    assert.equal(producer.writes[0].topic, "dataspace.export.audit");
  } finally {
    await close(server);
  }
});

test("catalog publish writes catalog event and audit", async () => {
  const { app, pool, producer } = buildApp();
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dataspace/catalog/publish`, {
      method: "POST",
      headers: {
        "x-api-key": "test-key"
      }
    });
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.status, "accepted");
    assert.equal(producer.writes[0].topic, "dataspace.catalog");
    assert.equal(producer.writes[1].topic, "dataspace.export.audit");
    assert.equal(pool.inserts.length, 1);
  } finally {
    await close(server);
  }
});

test("full pipeline demo summary includes all sections", async () => {
  const { app } = buildApp({ maxRecords: 10 });
  const { server, url } = await listen(app);

  try {
    const response = await fetch(`${url}/dataspace/export/full-pipeline-demo-summary`, {
      headers: {
        "x-api-key": "test-key"
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.semantic.length > 0, true);
    assert.equal(body.data.grid.length, 1);
    assert.equal(body.data.proposal.length, 1);
    assert.equal(body.data.approval.length, 1);
    assert.equal(body.data.mock.length, 1);
    assert.equal(body.data.mock[0].no_real_execution, true);
  } finally {
    await close(server);
  }
});
