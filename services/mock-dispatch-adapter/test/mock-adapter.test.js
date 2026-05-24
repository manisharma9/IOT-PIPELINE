"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAuditPayload,
  buildMockCommandPayload,
  buildMockResultPayload
} = require("../src/mock-adapter");
const { processReadyMessage } = require("../src/kafka");
const { validateReadyEvent } = require("../src/validation");

function readyEvent(overrides = {}) {
  return {
    dispatch_command_id: 1,
    proposal_id: "proposal-signal-001",
    community_id: "community-dublin-north",
    household_id: "household-001",
    device_id: "evse-001",
    requested_action: "reduce_load",
    proposed_action: "reduce_ev_charging",
    target_kw: 2.5,
    start_time: "2026-05-24T18:00:00.000Z",
    end_time: "2026-05-24T19:00:00.000Z",
    status: "ready_to_dispatch",
    no_execution: true,
    execution_blocked: true,
    correlation_id: "signal-001",
    ...overrides
  };
}

function kafkaMessage(payload) {
  return {
    offset: "1",
    value: Buffer.from(JSON.stringify(payload))
  };
}

function fakePool() {
  const writes = [];

  return {
    writes,
    query: async (sql, params) => {
      if (sql.includes("INSERT INTO dispatch_execution_audit")) {
        writes.push({ sql, params });
        return {
          rows: [
            {
              id: writes.length,
              event_time: params[0],
              created_at: params[1]
            }
          ]
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };
}

test("valid ready event creates mock command", () => {
  const validation = validateReadyEvent(readyEvent());
  assert.equal(validation.valid, true);

  const command = buildMockCommandPayload(validation.value, {
    eventTime: "2026-05-24T18:05:00.000Z"
  });

  assert.equal(command.mock_device_type, "ev_charger");
  assert.equal(command.command, "set_charging_limit");
  assert.equal(command.simulated, true);
  assert.equal(command.no_real_execution, true);
  assert.equal(command.execution_mode, "mock");
});

test("ready event without no_execution true is rejected", () => {
  const validation = validateReadyEvent(readyEvent({ no_execution: false }));

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.includes("no_execution")), true);
});

test("ready event without execution_blocked true is rejected", () => {
  const validation = validateReadyEvent(readyEvent({ execution_blocked: false }));

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.includes("execution_blocked")), true);
});

test("reduce_ev_charging maps to ev_charger mock command", () => {
  const command = buildMockCommandPayload(readyEvent({ proposed_action: "reduce_ev_charging" }));

  assert.equal(command.mock_device_type, "ev_charger");
  assert.equal(command.command, "set_charging_limit");
});

test("delay_flexible_load maps to flexible_load mock command", () => {
  const command = buildMockCommandPayload(readyEvent({ proposed_action: "delay_flexible_load" }));

  assert.equal(command.mock_device_type, "flexible_load");
  assert.equal(command.command, "delay_start");
  assert.equal(command.target.time_window.start_time, "2026-05-24T18:00:00.000Z");
});

test("discharge_battery_if_available maps to battery mock command", () => {
  const command = buildMockCommandPayload(
    readyEvent({ proposed_action: "discharge_battery_if_available" })
  );

  assert.equal(command.mock_device_type, "battery");
  assert.equal(command.command, "discharge_mock");
});

test("mock sent and result events include mock safety flags", () => {
  const command = buildMockCommandPayload(readyEvent());
  const result = buildMockResultPayload(command);
  const audit = buildAuditPayload(command, result);

  assert.equal(command.simulated, true);
  assert.equal(command.no_real_execution, true);
  assert.equal(result.execution_mode, "mock");
  assert.equal(result.no_real_execution, true);
  assert.equal(audit.no_real_execution, true);
  assert.equal(audit.execution_mode, "mock");
});

test("processing valid ready event publishes sent, result, and audit", async () => {
  const pool = fakePool();
  const kafkaWrites = [];
  const result = await processReadyMessage({
    topic: "dispatch.command.ready",
    partition: 0,
    message: kafkaMessage(readyEvent()),
    pool,
    producer: {
      send: async (message) => {
        kafkaWrites.push(message);
      }
    },
    eventTime: "2026-05-24T18:05:00.000Z"
  });

  assert.equal(result.status, "simulated");
  assert.equal(pool.writes.length, 1);
  assert.equal(kafkaWrites.length, 3);
  assert.equal(kafkaWrites[0].topic, "dispatch.command.mock.sent");
  assert.equal(kafkaWrites[1].topic, "dispatch.command.mock.result");
  assert.equal(kafkaWrites[2].topic, "dispatch.mock.audit");

  const sentEvent = JSON.parse(kafkaWrites[0].messages[0].value);
  const resultEvent = JSON.parse(kafkaWrites[1].messages[0].value);

  assert.equal(sentEvent.simulated, true);
  assert.equal(sentEvent.no_real_execution, true);
  assert.equal(resultEvent.execution_mode, "mock");
});

test("processing invalid ready event does not create mock sent or result", async () => {
  const pool = fakePool();
  const kafkaWrites = [];
  const result = await processReadyMessage({
    topic: "dispatch.command.ready",
    partition: 0,
    message: kafkaMessage(readyEvent({ no_execution: false })),
    pool,
    producer: {
      send: async (message) => {
        kafkaWrites.push(message);
      }
    },
    eventTime: "2026-05-24T18:05:00.000Z"
  });

  assert.equal(result.status, "rejected");
  assert.equal(pool.writes.length, 1);
  assert.equal(kafkaWrites.length, 1);
  assert.equal(kafkaWrites[0].topic, "dispatch.mock.audit");
});
