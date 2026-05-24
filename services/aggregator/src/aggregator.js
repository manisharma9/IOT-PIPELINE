"use strict";

const SEVERITY_TARGET_KW = Object.freeze({
  low: 1.0,
  medium: 2.5,
  high: 5.0,
  critical: 7.5
});

const ACTION_RULES = Object.freeze({
  reduce_load: {
    proposal_type: "load_reduction",
    proposed_action: "reduce_ev_charging",
    alternatives: ["delay_flexible_load", "discharge_battery_if_available"],
    summary: "Reduce flexible EV charging demand during the grid signal window."
  },
  shift_load: {
    proposal_type: "load_shift",
    proposed_action: "delay_flexible_load",
    alternatives: ["reduce_ev_charging"],
    summary: "Delay flexible household load until after the grid signal window."
  },
  increase_export: {
    proposal_type: "export_increase",
    proposed_action: "increase_pv_export_if_available",
    alternatives: ["discharge_battery_if_available"],
    summary: "Prefer available local PV export before a later dispatch workflow."
  },
  reduce_export: {
    proposal_type: "export_reduction",
    proposed_action: "reduce_export_limit",
    alternatives: ["reduce_battery_charging"],
    summary: "Limit export from flexible DER assets during the grid signal window."
  }
});

function sanitizeIdPart(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function normalizeSeverity(severity) {
  const normalized = String(severity || "medium").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SEVERITY_TARGET_KW, normalized)
    ? normalized
    : "medium";
}

function getTargetKwForSeverity(severity) {
  return SEVERITY_TARGET_KW[normalizeSeverity(severity)];
}

function getActionRule(requestedAction) {
  return ACTION_RULES[requestedAction] || null;
}

function buildProposalId(signal, createdAt) {
  const signalId = sanitizeIdPart(signal.signal_id || signal.correlation_id || "signal");
  const timestamp = Number.isNaN(Date.parse(createdAt))
    ? Date.now()
    : Date.parse(createdAt);

  return `proposal-${signalId}-${timestamp}`;
}

function buildReason(rule, signal, targetKw, severity) {
  const reason = signal.reason ? ` Source reason: ${signal.reason}` : "";
  return `${rule.summary} Target is ${targetKw} kW because severity is ${severity}.${reason}`;
}

function buildAuditPayload(proposal, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();
  const status = options.status || proposal.status || "proposed";

  return {
    audit_id: `audit-${proposal.proposal_id}`,
    event_time: eventTime,
    status,
    proposal_id: proposal.proposal_id,
    signal_id: proposal.signal_id,
    dso_id: proposal.dso_id,
    community_id: proposal.community_id,
    requested_action: proposal.requested_action,
    proposed_action: proposal.proposed_action,
    target_kw: proposal.target_kw,
    source_topic: proposal.source_topic,
    output_topic: proposal.output_topic,
    correlation_id: proposal.correlation_id,
    message: options.message || "Dispatch command proposal created. No command was executed.",
    no_execution: true
  };
}

function buildRejectedAudit(input, errors, options = {}) {
  const eventTime = options.eventTime || new Date().toISOString();
  const signal =
    input && input.ieee20305_payload && input.ieee20305_payload.signal
      ? input.ieee20305_payload.signal
      : input || {};
  const signalId =
    signal.signal_id || signal.id || (input && input.correlation_id) || "unknown";

  return {
    audit_id: `audit-rejected-${sanitizeIdPart(signalId)}-${Date.parse(eventTime) || Date.now()}`,
    event_time: eventTime,
    status: "failed",
    signal_id: signalId,
    community_id:
      signal.community_id ||
      (input && input.community_id) ||
      (input && input.ieee20305_payload && input.ieee20305_payload.community
        ? input.ieee20305_payload.community.id
        : null),
    source_topic: options.sourceTopic || (input && input.source_topic) || "grid.signals",
    output_topic: options.auditTopic || "dispatch.command.audit",
    correlation_id: (input && input.correlation_id) || signalId,
    validation_errors: errors,
    message: "Grid signal failed Phase 5 validation. No dispatch proposal was created.",
    no_execution: true
  };
}

function createDispatchProposal(signal, options = {}) {
  const rule = getActionRule(signal.requested_action);
  if (!rule) {
    throw new Error(`Unsupported requested_action: ${signal.requested_action}`);
  }

  const createdAt = options.createdAt || new Date().toISOString();
  const severity = normalizeSeverity(signal.severity);
  const targetKw = getTargetKwForSeverity(severity);
  const proposalId = options.proposalId || buildProposalId(signal, createdAt);
  const correlationId = signal.correlation_id || signal.signal_id || proposalId;
  const outputTopic = options.outputTopic || "dispatch.command.proposed";
  const sourceTopic = options.sourceTopic || signal.source_topic || "grid.signals";

  const decisionPayload = {
    proposal_id: proposalId,
    rule_version: "phase-5-rule-v1",
    requested_action: signal.requested_action,
    proposed_action: rule.proposed_action,
    target_kw: targetKw,
    severity,
    original_severity: signal.severity,
    severity_fallback_used: severity !== String(signal.severity || "").trim().toLowerCase(),
    alternatives: rule.alternatives,
    no_execution: true,
    explanation: buildReason(rule, signal, targetKw, severity)
  };

  const proposal = {
    proposal_id: proposalId,
    event_time: signal.start_time,
    created_at: createdAt,
    source_topic: sourceTopic,
    output_topic: outputTopic,
    signal_id: signal.signal_id,
    dso_id: signal.dso_id || null,
    community_id: signal.community_id,
    household_id: signal.household_id || null,
    device_id: signal.device_id || null,
    proposal_type: rule.proposal_type,
    requested_action: signal.requested_action,
    proposed_action: rule.proposed_action,
    target_kw: targetKw,
    start_time: signal.start_time,
    end_time: signal.end_time,
    priority: severity,
    status: "proposed",
    reason: buildReason(rule, signal, targetKw, severity),
    decision_payload: decisionPayload,
    source_grid_signal: signal.source_grid_signal || signal.raw_event || signal,
    source_ieee20305_payload: signal.source_ieee20305_payload || null,
    audit_payload: null,
    correlation_id: correlationId
  };

  proposal.audit_payload = buildAuditPayload(proposal, {
    eventTime: createdAt,
    status: "proposed"
  });

  return proposal;
}

module.exports = {
  ACTION_RULES,
  SEVERITY_TARGET_KW,
  buildAuditPayload,
  buildRejectedAudit,
  createDispatchProposal,
  getActionRule,
  getTargetKwForSeverity,
  normalizeSeverity
};
