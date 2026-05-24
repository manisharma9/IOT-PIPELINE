"use strict";

const SAFETY_NOTE = "Mock adapter only. No real household device was controlled.";

const ACTION_COMMANDS = Object.freeze({
  reduce_ev_charging: {
    mock_device_type: "ev_charger",
    command: "set_charging_limit",
    targetKind: "reduced_kw"
  },
  delay_flexible_load: {
    mock_device_type: "flexible_load",
    command: "delay_start",
    targetKind: "time_window"
  },
  discharge_battery_if_available: {
    mock_device_type: "battery",
    command: "discharge_mock",
    targetKind: "target_kw"
  },
  reduce_battery_charging: {
    mock_device_type: "battery",
    command: "reduce_charge_rate",
    targetKind: "target_kw"
  },
  increase_pv_export_if_available: {
    mock_device_type: "solar_inverter",
    command: "increase_export_mock",
    targetKind: "target_kw"
  },
  reduce_export_limit: {
    mock_device_type: "solar_inverter",
    command: "reduce_export_limit",
    targetKind: "target_kw"
  }
});

function getDispatchCommandId(readyEvent) {
  return readyEvent.dispatch_command_id || readyEvent.id || null;
}

function getTargetForRule(rule, readyEvent) {
  if (rule.targetKind === "time_window") {
    return {
      time_window: {
        start_time: readyEvent.start_time || null,
        end_time: readyEvent.end_time || null
      }
    };
  }

  if (rule.targetKind === "reduced_kw") {
    return {
      reduced_kw: readyEvent.target_kw || null
    };
  }

  return {
    target_kw: readyEvent.target_kw || null
  };
}

function getActionRule(proposedAction) {
  return ACTION_COMMANDS[proposedAction] || null;
}

function buildMockCommandPayload(readyEvent, options = {}) {
  const rule = getActionRule(readyEvent.proposed_action);
  if (!rule) {
    throw new Error(`Unsupported proposed_action: ${readyEvent.proposed_action}`);
  }

  const eventTime = options.eventTime || new Date().toISOString();
  const dispatchCommandId = getDispatchCommandId(readyEvent);
  const proposalId = readyEvent.proposal_id || `dispatch-command-${dispatchCommandId || "unknown"}`;

  return {
    event_time: eventTime,
    dispatch_command_id: dispatchCommandId,
    proposal_id: proposalId,
    community_id: readyEvent.community_id,
    household_id: readyEvent.household_id || null,
    device_id: readyEvent.device_id || null,
    requested_action: readyEvent.requested_action,
    proposed_action: readyEvent.proposed_action,
    mock_device_type: rule.mock_device_type,
    command: rule.command,
    target: getTargetForRule(rule, readyEvent),
    simulated: true,
    no_real_execution: true,
    execution_mode: "mock",
    safety_note: SAFETY_NOTE,
    correlation_id: readyEvent.correlation_id || proposalId,
    source_ready_event: readyEvent
  };
}

function buildMockResultPayload(mockCommand, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();

  return {
    event_time: eventTime,
    dispatch_command_id: mockCommand.dispatch_command_id,
    proposal_id: mockCommand.proposal_id,
    community_id: mockCommand.community_id,
    household_id: mockCommand.household_id,
    device_id: mockCommand.device_id,
    requested_action: mockCommand.requested_action,
    proposed_action: mockCommand.proposed_action,
    mock_device_type: mockCommand.mock_device_type,
    command: mockCommand.command,
    simulation_status: "simulated_success",
    message: "Mock dispatch simulation completed. No real household device was controlled.",
    simulated: true,
    no_real_execution: true,
    execution_mode: "mock",
    safety_note: SAFETY_NOTE,
    correlation_id: mockCommand.correlation_id
  };
}

function buildAuditPayload(mockCommand, mockResult, options = {}) {
  const eventTime = options.eventTime || mockResult.event_time || new Date().toISOString();

  return {
    event_time: eventTime,
    dispatch_command_id: mockCommand.dispatch_command_id,
    proposal_id: mockCommand.proposal_id,
    community_id: mockCommand.community_id,
    household_id: mockCommand.household_id,
    device_id: mockCommand.device_id,
    requested_action: mockCommand.requested_action,
    proposed_action: mockCommand.proposed_action,
    mock_device_type: mockCommand.mock_device_type,
    simulation_status: mockResult.simulation_status,
    simulation_message: mockResult.message,
    no_real_execution: true,
    execution_mode: "mock",
    simulated: true,
    safety_note: SAFETY_NOTE,
    correlation_id: mockCommand.correlation_id
  };
}

function buildRejectedAuditPayload(input, errors, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();

  return {
    event_time: eventTime,
    dispatch_command_id: input && (input.dispatch_command_id || input.id) ? input.dispatch_command_id || input.id : null,
    proposal_id: input && input.proposal_id ? input.proposal_id : null,
    community_id: input && input.community_id ? input.community_id : null,
    household_id: input && input.household_id ? input.household_id : null,
    device_id: input && input.device_id ? input.device_id : null,
    requested_action: input && input.requested_action ? input.requested_action : null,
    proposed_action: input && input.proposed_action ? input.proposed_action : null,
    mock_device_type: "none",
    simulation_status: "rejected_invalid_ready_event",
    simulation_message: "Ready event failed mock dispatch validation. No mock command was created.",
    validation_errors: errors,
    no_real_execution: true,
    execution_mode: "mock",
    simulated: true,
    safety_note: SAFETY_NOTE,
    correlation_id: input && input.correlation_id ? input.correlation_id : null
  };
}

module.exports = {
  ACTION_COMMANDS,
  SAFETY_NOTE,
  buildAuditPayload,
  buildMockCommandPayload,
  buildMockResultPayload,
  buildRejectedAuditPayload,
  getActionRule,
  getDispatchCommandId
};
