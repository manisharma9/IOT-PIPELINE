"use strict";

const {
  getDispatchCommandById,
  insertDispatchApprovalAudit,
  updateDispatchCommandStatus
} = require("./db");
const { getTargetStatusForAction, validateTransition } = require("./status-machine");
const { validateApprovalRequest } = require("./validation");

function getProposalId(row) {
  return (
    (row.decision_payload && row.decision_payload.proposal_id) ||
    (row.audit_payload && row.audit_payload.proposal_id) ||
    `dispatch-command-${row.id}`
  );
}

function getComment(validationValue) {
  return validationValue.reason || validationValue.comment || "";
}

function safeSourceDispatchCommand(row) {
  return {
    id: row.id,
    event_time: row.event_time,
    created_at: row.created_at,
    signal_id: row.signal_id,
    dso_id: row.dso_id,
    community_id: row.community_id,
    household_id: row.household_id,
    device_id: row.device_id,
    proposal_type: row.proposal_type,
    requested_action: row.requested_action,
    proposed_action: row.proposed_action,
    target_kw: row.target_kw,
    start_time: row.start_time,
    end_time: row.end_time,
    priority: row.priority,
    status: row.status,
    reason: row.reason,
    correlation_id: row.correlation_id,
    decision_payload: row.decision_payload
  };
}

function buildApprovalPayload(row, action, previousStatus, newStatus, requestValue, eventTime) {
  return {
    event_time: eventTime,
    dispatch_command_id: row.id,
    proposal_id: getProposalId(row),
    previous_status: previousStatus,
    new_status: newStatus,
    action,
    reviewer: {
      id: requestValue.reviewer_id,
      role: requestValue.reviewer_role
    },
    comment: getComment(requestValue),
    requested_action: row.requested_action,
    proposed_action: row.proposed_action,
    no_execution: true,
    execution_blocked: true
  };
}

function buildAuditEvent(row, action, previousStatus, newStatus, requestValue, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();
  const approvalPayload = buildApprovalPayload(
    row,
    action,
    previousStatus,
    newStatus,
    requestValue,
    eventTime
  );
  const auditPayload = {
    audit_id: `approval-audit-${row.id}-${newStatus}-${Date.parse(eventTime) || Date.now()}`,
    event_time: eventTime,
    dispatch_command_id: row.id,
    proposal_id: getProposalId(row),
    previous_status: previousStatus,
    new_status: newStatus,
    action,
    reviewer_id: requestValue.reviewer_id,
    reviewer_role: requestValue.reviewer_role,
    comment: getComment(requestValue),
    message:
      newStatus === "ready_to_dispatch"
        ? "Ready for dispatch preparation only. No device command executed."
        : `Dispatch command status changed from ${previousStatus} to ${newStatus}. No device command executed.`,
    no_execution: true,
    execution_blocked: true,
    correlation_id: row.correlation_id
  };

  return {
    event_time: eventTime,
    created_at: eventTime,
    dispatch_command_id: row.id,
    proposal_id: getProposalId(row),
    previous_status: previousStatus,
    new_status: newStatus,
    action,
    reviewer_id: requestValue.reviewer_id,
    reviewer_role: requestValue.reviewer_role,
    comment: getComment(requestValue),
    approval_payload: approvalPayload,
    source_dispatch_command: safeSourceDispatchCommand(row),
    audit_payload: auditPayload,
    correlation_id: row.correlation_id
  };
}

function buildReadyEvent(row, auditEvent, readyTopic = "dispatch.command.ready") {
  return {
    id: row.id,
    proposal_id: auditEvent.proposal_id,
    event_time: auditEvent.event_time,
    source_topic: "dispatch.command.proposed",
    output_topic: readyTopic,
    community_id: row.community_id,
    household_id: row.household_id,
    device_id: row.device_id,
    signal_id: row.signal_id,
    dso_id: row.dso_id,
    requested_action: row.requested_action,
    proposed_action: row.proposed_action,
    target_kw: row.target_kw,
    start_time: row.start_time,
    end_time: row.end_time,
    status: "ready_to_dispatch",
    approval: {
      reviewer_id: auditEvent.reviewer_id,
      reviewer_role: auditEvent.reviewer_role,
      comment: auditEvent.comment,
      approved_at: auditEvent.event_time
    },
    decision_payload: row.decision_payload,
    correlation_id: row.correlation_id,
    no_execution: true,
    execution_blocked: true,
    message: "Ready for dispatch preparation only. No device command executed."
  };
}

async function applyApprovalAction({
  pool,
  producer,
  dispatchCommandId,
  action,
  body,
  publishApprovalAudit,
  publishReadyCommand,
  auditTopic = "dispatch.approval.audit",
  readyTopic = "dispatch.command.ready",
  eventTime
}) {
  const requestValidation = validateApprovalRequest(action, body);
  if (!requestValidation.valid) {
    return {
      ok: false,
      httpStatus: 400,
      error: "invalid_approval_request",
      details: requestValidation.errors
    };
  }

  const newStatus = getTargetStatusForAction(action);
  const row = await getDispatchCommandById(pool, dispatchCommandId);
  if (!row) {
    return {
      ok: false,
      httpStatus: 404,
      error: "dispatch_proposal_not_found"
    };
  }

  const previousStatus = row.status;
  const transition = validateTransition(previousStatus, newStatus);
  if (!transition.valid) {
    return {
      ok: false,
      httpStatus: 400,
      error: transition.error,
      message: transition.message,
      previous_status: previousStatus,
      requested_status: newStatus
    };
  }

  const auditEvent = buildAuditEvent(
    row,
    action,
    previousStatus,
    newStatus,
    requestValidation.value,
    { eventTime }
  );

  const updatedRow = await updateDispatchCommandStatus(
    pool,
    dispatchCommandId,
    previousStatus,
    newStatus,
    auditEvent.audit_payload
  );
  if (!updatedRow) {
    return {
      ok: false,
      httpStatus: 409,
      error: "status_update_conflict",
      message: "Dispatch proposal status changed before this transition could be applied."
    };
  }

  await insertDispatchApprovalAudit(pool, auditEvent);

  if (publishApprovalAudit) {
    await publishApprovalAudit(producer, auditTopic, auditEvent);
  }

  let readyEvent = null;
  if (newStatus === "ready_to_dispatch") {
    readyEvent = buildReadyEvent(updatedRow, auditEvent, readyTopic);
    if (publishReadyCommand) {
      await publishReadyCommand(producer, readyTopic, readyEvent);
    }
  }

  return {
    ok: true,
    status: "updated",
    previous_status: previousStatus,
    new_status: newStatus,
    proposal: updatedRow,
    audit: auditEvent,
    ready_event: readyEvent
  };
}

module.exports = {
  applyApprovalAction,
  buildApprovalPayload,
  buildAuditEvent,
  buildReadyEvent,
  getProposalId,
  safeSourceDispatchCommand
};
