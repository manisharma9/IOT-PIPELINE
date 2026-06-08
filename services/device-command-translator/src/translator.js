"use strict";

const {
  findDevicesForScope,
  getTotalControllableLoadKw,
  listDevices
} = require("./device-registry");
const { validateReadyCommand } = require("./validation");

const EXECUTION_MODE = "simulated_device_api";
const SAFETY_NOTE = "Simulated device API translation only. No real Shelly, Enode, Easee, or heat pump device was controlled.";

function roundKw(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function getDispatchCommandId(readyEvent) {
  return readyEvent.dispatch_command_id || readyEvent.id || null;
}

function getProposalId(readyEvent) {
  return readyEvent.proposal_id || `dispatch-command-${getDispatchCommandId(readyEvent) || "unknown"}`;
}

function getAreaId(readyEvent) {
  return (
    readyEvent.area_id ||
    (readyEvent.decision_payload && readyEvent.decision_payload.area_id) ||
    "dublin-north"
  );
}

function numberFrom(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function getRequestedReductionKw(readyEvent, devices = listDevices()) {
  const fixedKw = numberFrom(
    readyEvent.requested_reduction_kw,
    readyEvent.target_kw,
    readyEvent.decision_payload && readyEvent.decision_payload.requested_reduction_kw,
    readyEvent.decision_payload && readyEvent.decision_payload.target_kw
  );
  if (fixedKw) {
    return roundKw(fixedKw);
  }

  const percent = numberFrom(
    readyEvent.requested_reduction_percent,
    readyEvent.reduction_percent,
    readyEvent.target_percent,
    readyEvent.decision_payload && readyEvent.decision_payload.requested_reduction_percent,
    readyEvent.decision_payload && readyEvent.decision_payload.reduction_percent
  );
  if (percent) {
    return roundKw(getTotalControllableLoadKw(devices) * Math.min(percent, 100) / 100);
  }

  return null;
}

function allocateReduction(devices, requestedReductionKw) {
  const safeDevices = devices.filter((device) => Number(device.controllable_load_kw) > 0);
  const totalLoad = getTotalControllableLoadKw(safeDevices);
  const target = Math.min(Number(requestedReductionKw || 0), totalLoad);
  let allocated = 0;

  return safeDevices.map((device, index) => {
    const remainingTarget = roundKw(target - allocated);
    const isLast = index === safeDevices.length - 1;
    const proportional = totalLoad > 0
      ? target * Number(device.controllable_load_kw) / totalLoad
      : 0;
    const allocation = isLast
      ? Math.min(Number(device.controllable_load_kw), remainingTarget)
      : Math.min(Number(device.controllable_load_kw), proportional);
    const rounded = roundKw(Math.max(0, allocation));
    allocated = roundKw(allocated + rounded);

    return {
      device,
      allocated_reduction_kw: rounded
    };
  }).filter((allocation) => allocation.allocated_reduction_kw > 0);
}

function getDeviceAction(device, readyEvent, allocatedReductionKw) {
  const requested = readyEvent.requested_action;
  const proposed = readyEvent.proposed_action;

  if (device.device_type === "shelly_plug") {
    if (requested === "restore_load" || proposed === "restore_load") {
      return "restore_load";
    }
    if (requested === "turn_on" || proposed === "turn_on") {
      return "turn_on";
    }
    if (requested === "turn_off" || proposed === "turn_off") {
      return "turn_off";
    }
    if (["reduce_load", "shift_load"].includes(requested) || proposed === "delay_flexible_load") {
      return allocatedReductionKw >= Number(device.controllable_load_kw) ? "turn_off" : "reduce_load";
    }
  }

  if (device.device_type === "ev_charger" && device.provider === "enode") {
    if (requested === "restore_load" || proposed === "restore_charging_power") {
      return "restore_charging_power";
    }
    if (requested === "resume_charging" || proposed === "resume_charging") {
      return "resume_charging";
    }
    if (requested === "pause_charging" || proposed === "pause_charging") {
      return "pause_charging";
    }
    if (
      ["reduce_load", "shift_load"].includes(requested) ||
      ["reduce_ev_charging", "delay_flexible_load"].includes(proposed)
    ) {
      return allocatedReductionKw >= Number(device.controllable_load_kw)
        ? "pause_charging"
        : "reduce_charging_power";
    }
  }

  if (device.device_type === "heat_pump") {
    if (requested === "restore_load" || proposed === "restore_load") {
      return "restore_load";
    }
    if (requested === "boost_heat" || proposed === "boost_heat") {
      return "boost_heat";
    }
    if (requested === "set_temperature" || proposed === "set_temperature") {
      return "set_temperature";
    }
    if (["reduce_load", "shift_load"].includes(requested) || proposed === "delay_flexible_load") {
      return "reduce_load";
    }
  }

  return null;
}

function buildEndpoint(device) {
  if (device.device_type === "shelly_plug") {
    return {
      provider: "shelly",
      method: "POST",
      path: "/shelly/plug/command"
    };
  }

  if (device.provider === "enode" && device.device_type === "ev_charger") {
    return {
      provider: "enode",
      method: "POST",
      path: `/enode/chargers/${device.device_id}/command`
    };
  }

  if (device.device_type === "heat_pump") {
    return {
      provider: "heat_pump_simulator",
      method: "POST",
      path: "/heat-pump/command"
    };
  }

  return null;
}

function buildCommandPayload({ readyEvent, device, action, allocatedReductionKw, requestedReductionKw, eventTime }) {
  const dispatchCommandId = getDispatchCommandId(readyEvent);
  const proposalId = getProposalId(readyEvent);
  const commandId = [
    "device-command",
    proposalId,
    device.device_id,
    Date.parse(eventTime) || Date.now()
  ].join("-");
  const endpoint = buildEndpoint(device);

  return {
    event_time: eventTime,
    command_id: commandId,
    dispatch_command_id: dispatchCommandId,
    proposal_id: proposalId,
    device_id: device.device_id,
    device_type: device.device_type,
    provider: device.provider || null,
    charger_type: device.charger_type || null,
    community_id: readyEvent.community_id,
    area_id: getAreaId(readyEvent),
    requested_action: readyEvent.requested_action,
    proposed_action: readyEvent.proposed_action,
    requested_reduction_kw: roundKw(requestedReductionKw),
    allocated_reduction_kw: roundKw(allocatedReductionKw),
    action,
    endpoint,
    payload: {
      device_id: device.device_id,
      charger_id: device.device_id,
      action,
      requested_reduction_kw: roundKw(allocatedReductionKw),
      simulated: true,
      no_real_execution: true,
      execution_mode: EXECUTION_MODE,
      safety_note: SAFETY_NOTE
    },
    simulated: true,
    no_real_execution: true,
    execution_mode: EXECUTION_MODE,
    safety_note: SAFETY_NOTE,
    correlation_id: readyEvent.correlation_id || proposalId
  };
}

function translateReadyCommand(readyEvent, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();
  const validation = validateReadyCommand(readyEvent);
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      commands: []
    };
  }

  const devices = options.devices || findDevicesForScope({
    communityId: readyEvent.community_id,
    areaId: getAreaId(readyEvent)
  });
  if (devices.length === 0) {
    return {
      valid: false,
      errors: ["no simulated devices found for requested community/area."],
      commands: []
    };
  }

  const requestedReductionKw = getRequestedReductionKw(readyEvent, devices);
  if (!requestedReductionKw) {
    return {
      valid: false,
      errors: ["requested reduction must include fixed kW or percentage value."],
      commands: []
    };
  }

  const allocations = allocateReduction(devices, requestedReductionKw);
  const commands = [];
  const errors = [];

  allocations.forEach(({ device, allocated_reduction_kw: allocatedReductionKw }) => {
    const action = getDeviceAction(device, readyEvent, allocatedReductionKw);
    if (!action || !device.supported_actions.includes(action)) {
      errors.push(`unsupported action for ${device.device_id}.`);
      return;
    }

    const endpoint = buildEndpoint(device);
    if (!endpoint) {
      errors.push(`unsupported device type for ${device.device_id}.`);
      return;
    }

    commands.push(buildCommandPayload({
      readyEvent,
      device,
      action,
      allocatedReductionKw,
      requestedReductionKw,
      eventTime
    }));
  });

  return {
    valid: errors.length === 0 && commands.length > 0,
    errors,
    commands,
    requested_reduction_kw: roundKw(requestedReductionKw),
    total_controllable_load_kw: roundKw(getTotalControllableLoadKw(devices))
  };
}

function buildResultPayload(command, simulatedResponse, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();

  return {
    event_time: eventTime,
    command_id: command.command_id,
    dispatch_command_id: command.dispatch_command_id,
    proposal_id: command.proposal_id,
    device_id: command.device_id,
    device_type: command.device_type,
    provider: command.provider,
    community_id: command.community_id,
    area_id: command.area_id,
    requested_reduction_kw: command.requested_reduction_kw,
    allocated_reduction_kw: command.allocated_reduction_kw,
    action: command.action,
    translated_command: command,
    simulated_response: simulatedResponse,
    status: simulatedResponse && simulatedResponse.accepted ? "simulated_accepted" : "simulated_rejected",
    simulated: true,
    no_real_execution: true,
    execution_mode: EXECUTION_MODE,
    safety_note: SAFETY_NOTE,
    correlation_id: command.correlation_id
  };
}

function buildAuditPayload(resultPayload) {
  return {
    audit_id: `device-command-audit-${resultPayload.command_id}`,
    event_time: resultPayload.event_time,
    command_id: resultPayload.command_id,
    proposal_id: resultPayload.proposal_id,
    device_id: resultPayload.device_id,
    device_type: resultPayload.device_type,
    provider: resultPayload.provider,
    community_id: resultPayload.community_id,
    area_id: resultPayload.area_id,
    requested_reduction_kw: resultPayload.requested_reduction_kw,
    allocated_reduction_kw: resultPayload.allocated_reduction_kw,
    action: resultPayload.action,
    status: resultPayload.status,
    simulated: true,
    no_real_execution: true,
    execution_mode: EXECUTION_MODE,
    safety_note: SAFETY_NOTE,
    correlation_id: resultPayload.correlation_id
  };
}

function buildRejectedAuditPayload(input, errors, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();
  const proposalId = input && input.proposal_id ? input.proposal_id : "unknown";

  return {
    audit_id: `device-command-audit-rejected-${proposalId}-${Date.parse(eventTime) || Date.now()}`,
    event_time: eventTime,
    command_id: null,
    proposal_id: proposalId,
    device_id: null,
    device_type: null,
    provider: null,
    community_id: input && input.community_id ? input.community_id : null,
    area_id: input ? getAreaId(input) : null,
    requested_reduction_kw: null,
    allocated_reduction_kw: null,
    action: null,
    status: "rejected",
    validation_errors: errors,
    simulated: true,
    no_real_execution: true,
    execution_mode: EXECUTION_MODE,
    safety_note: SAFETY_NOTE,
    correlation_id: input && input.correlation_id ? input.correlation_id : proposalId
  };
}

module.exports = {
  EXECUTION_MODE,
  SAFETY_NOTE,
  allocateReduction,
  buildAuditPayload,
  buildCommandPayload,
  buildRejectedAuditPayload,
  buildResultPayload,
  getAreaId,
  getDeviceAction,
  getRequestedReductionKw,
  roundKw,
  translateReadyCommand
};
