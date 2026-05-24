"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildAuditPayload,
  buildResultPayload,
  getRequestedReductionKw,
  translateReadyCommand
} = require("../src/translator");

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

test("translator maps fixed kW reduction to device commands", () => {
  const result = translateReadyCommand(readyEvent(), {
    eventTime: "2026-05-25T10:00:00.000Z"
  });

  assert.equal(result.valid, true);
  assert.equal(result.requested_reduction_kw, 2.5);
  assert.equal(result.commands.length, 2);
  assert.ok(result.commands.some((command) => command.device_id === "shelly-plug-001"));
  assert.ok(result.commands.some((command) => command.device_id === "easee-core-001"));
  assert.equal(result.commands[0].simulated, true);
  assert.equal(result.commands[0].no_real_execution, true);
});

test("translator maps percentage reduction to device commands", () => {
  const result = translateReadyCommand(readyEvent({
    target_kw: undefined,
    requested_reduction_percent: 50
  }));

  assert.equal(result.valid, true);
  assert.equal(getRequestedReductionKw(readyEvent({
    target_kw: undefined,
    requested_reduction_percent: 50
  })), 4.45);
  assert.equal(result.commands.length, 2);
  assert.equal(
    result.commands.reduce((sum, command) => sum + command.allocated_reduction_kw, 0),
    4.45
  );
});

test("translator includes simulated and no_real_execution flags", () => {
  const result = translateReadyCommand(readyEvent());

  result.commands.forEach((command) => {
    assert.equal(command.simulated, true);
    assert.equal(command.no_real_execution, true);
    assert.equal(command.payload.simulated, true);
    assert.equal(command.payload.no_real_execution, true);
  });
});

test("translator rejects unsupported device/action", () => {
  const result = translateReadyCommand(readyEvent(), {
    devices: [
      {
        device_id: "unknown-001",
        device_type: "unknown",
        community_id: "community-dublin-north",
        area_id: "dublin-north",
        controllable_load_kw: 1,
        supported_actions: []
      }
    ]
  });

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /unsupported/);
});

test("translator builds result and audit payload shape", () => {
  const command = translateReadyCommand(readyEvent()).commands[0];
  const response = {
    accepted: true,
    simulated: true,
    no_real_execution: true,
    action: command.action
  };
  const result = buildResultPayload(command, response, {
    eventTime: "2026-05-25T10:00:00.000Z"
  });
  const audit = buildAuditPayload(result);

  assert.equal(result.status, "simulated_accepted");
  assert.equal(result.translated_command.no_real_execution, true);
  assert.equal(result.simulated_response.accepted, true);
  assert.equal(audit.no_real_execution, true);
  assert.equal(audit.execution_mode, "simulated_device_api");
});
