"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildAuditRowFromResult,
  processReadyMessage,
  resolveSimulatorBaseUrl
} = require("../src/kafka");

function readyEvent(overrides = {}) {
  return {
    id: 42,
    proposal_id: "proposal-42",
    community_id: "community-dublin-north",
    area_id: "dublin-north",
    requested_action: "reduce_load",
    proposed_action: "reduce_ev_charging",
    target_kw: 2.5,
    status: "ready_to_dispatch",
    no_execution: true,
    execution_blocked: true,
    correlation_id: "corr-42",
    ...overrides
  };
}

test("translator publishes device.command.result and device.command.audit payload shapes", async () => {
  const published = [];
  const inserts = [];
  const producer = {
    send: async (payload) => {
      published.push(payload);
    }
  };
  const pool = {
    query: async (sql, params) => {
      inserts.push({ sql, params });
      return { rows: [{ id: inserts.length }] };
    }
  };

  const result = await processReadyMessage({
    topic: "dispatch.command.ready",
    partition: 0,
    message: {
      value: Buffer.from(JSON.stringify(readyEvent()))
    },
    pool,
    producer,
    commandSender: async (command) => ({
      accepted: true,
      simulated: true,
      no_real_execution: true,
      action: command.action
    }),
    eventTime: "2026-05-25T10:00:00.000Z"
  });

  assert.equal(result.status, "translated");
  assert.equal(result.command_count, 3);
  assert.equal(published.filter((item) => item.topic === "device.command.result").length, 3);
  assert.equal(published.filter((item) => item.topic === "device.command.audit").length, 3);
  assert.equal(inserts.length, 3);

  const resultMessage = JSON.parse(published[0].messages[0].value);
  assert.equal(resultMessage.simulated, true);
  assert.equal(resultMessage.no_real_execution, true);
  assert.equal(resultMessage.execution_mode, "simulated_device_api");
});

test("simulator base URL resolver supports heat pump simulator", () => {
  assert.equal(
    resolveSimulatorBaseUrl(
      { provider: "heat_pump_simulator" },
      { HEAT_PUMP_SIMULATOR_URL: "http://heat-pump-simulator:3011" }
    ),
    "http://heat-pump-simulator:3011"
  );
});

test("audit row payload shape is valid", async () => {
  const commandResult = await processReadyMessage({
    topic: "dispatch.command.ready",
    partition: 0,
    message: {
      value: Buffer.from(JSON.stringify(readyEvent()))
    },
    pool: { query: async () => ({ rows: [{ id: 1 }] }) },
    producer: { send: async () => {} },
    commandSender: async (command) => ({
      accepted: true,
      simulated: true,
      no_real_execution: true,
      action: command.action
    }),
    eventTime: "2026-05-25T10:00:00.000Z"
  });
  const row = buildAuditRowFromResult(commandResult.results[0].result);

  assert.equal(row.no_real_execution, true);
  assert.equal(row.execution_mode, "simulated_device_api");
  assert.equal(row.status, "simulated_accepted");
  assert.equal(typeof row.translated_command, "object");
  assert.equal(typeof row.simulated_response, "object");
});
