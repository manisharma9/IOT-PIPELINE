"use strict";

const { ACCESS_POLICY, LIMITATIONS, normalizeRequestedLimit } = require("./policy");
const { pseudonymizeDeviceId, pseudonymizeHouseholdId } = require("./pseudonymize");

function asIso(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function safeBoolean(value) {
  return value === true || value === "true";
}

function baseIdentity(row, salt) {
  return {
    community_id: row.community_id || null,
    household_ref: pseudonymizeHouseholdId(row.household_id, salt),
    device_ref: pseudonymizeDeviceId(row.device_id, salt)
  };
}

function mapSemanticRow(row, salt) {
  return {
    event_time: asIso(row.event_time),
    processed_at: asIso(row.processed_at),
    ...baseIdentity(row, salt),
    device_type: row.device_type || null,
    reading_name: row.reading_name || null,
    reading_unit: row.reading_unit || null,
    saref_type: row.saref_type || null,
    saref_property: row.saref_property || null,
    saref_unit: row.saref_unit || null,
    saref4ener_concept: row.saref4ener_concept || null,
    ngsi_type: row.ngsi_type || null,
    ngsi_property: row.ngsi_property || null,
    mapping_source: row.mapping_source || null,
    mapping_confidence: row.mapping_confidence || null,
    explanation: row.explanation || null,
    correlation_id: row.correlation_id || null
  };
}

function mapGridSignalRow(row) {
  return {
    event_time: asIso(row.event_time),
    processed_at: asIso(row.processed_at),
    community_id: row.community_id || null,
    resource_type: row.resource_type || "GridSignal",
    signal_id: row.signal_id || null,
    dso_id: row.dso_id || null,
    signal_type: row.signal_type || row.reading_name || null,
    severity: row.severity || null,
    requested_action: row.requested_action || null,
    translation_status: row.translation_status || null,
    translation_confidence: row.translation_confidence || null,
    explanation: row.explanation || null,
    correlation_id: row.correlation_id || null
  };
}

function mapDispatchProposalRow(row, salt) {
  return {
    id: row.id || null,
    event_time: asIso(row.event_time),
    created_at: asIso(row.created_at),
    ...baseIdentity(row, salt),
    signal_id: row.signal_id || null,
    proposal_type: row.proposal_type || null,
    requested_action: row.requested_action || null,
    proposed_action: row.proposed_action || null,
    target_kw: row.target_kw === null || row.target_kw === undefined ? null : Number(row.target_kw),
    start_time: asIso(row.start_time),
    end_time: asIso(row.end_time),
    priority: row.priority || null,
    status: row.status || null,
    reason: row.reason || null,
    correlation_id: row.correlation_id || null
  };
}

function mapApprovalAuditRow(row) {
  return {
    event_time: asIso(row.event_time),
    created_at: asIso(row.created_at),
    dispatch_command_id: row.dispatch_command_id || null,
    proposal_id: row.proposal_id || null,
    previous_status: row.previous_status || null,
    new_status: row.new_status || null,
    action: row.action || null,
    reviewer_role: row.reviewer_role || null,
    comment_present: Boolean(row.comment),
    correlation_id: row.correlation_id || null
  };
}

function mapMockDispatchRow(row, salt) {
  return {
    event_time: asIso(row.event_time),
    created_at: asIso(row.created_at),
    dispatch_command_id: row.dispatch_command_id || null,
    proposal_id: row.proposal_id || null,
    ...baseIdentity(row, salt),
    requested_action: row.requested_action || null,
    proposed_action: row.proposed_action || null,
    mock_device_type: row.mock_device_type || null,
    command: row.command || null,
    simulation_status: row.simulation_status || null,
    simulation_message: row.simulation_message || null,
    simulated: true,
    no_real_execution: safeBoolean(row.no_real_execution),
    execution_mode: row.execution_mode || "mock",
    safety_note: row.safety_note || "Mock adapter only. No real household device was controlled.",
    correlation_id: row.correlation_id || null
  };
}

const MAPPERS = Object.freeze({
  semantic_summary: mapSemanticRow,
  grid_signal_summary: mapGridSignalRow,
  dispatch_proposal_summary: mapDispatchProposalRow,
  approval_audit_summary: mapApprovalAuditRow,
  mock_dispatch_summary: mapMockDispatchRow
});

function mapRows(exportType, rows, salt, maxRecords) {
  const mapper = MAPPERS[exportType];
  if (!mapper) {
    return [];
  }

  return rows.slice(0, maxRecords).map((row) => mapper(row, salt));
}

function buildExportPayload({ exportType, communityId, rows = [], salt, generatedAt, maxRecords }) {
  const safeMax = normalizeRequestedLimit(maxRecords, maxRecords);
  const data = mapRows(exportType, rows, salt, safeMax);

  return {
    export_type: exportType,
    generated_at: generatedAt || new Date().toISOString(),
    access_policy: ACCESS_POLICY,
    minimization_applied: true,
    pseudonymization_applied: true,
    community_id: communityId || null,
    record_count: data.length,
    data,
    limitations: LIMITATIONS,
    no_raw_private_payloads: true
  };
}

function buildFullPipelineDemoPayload({ communityId, rows, salt, generatedAt, maxRecords }) {
  const safeMax = normalizeRequestedLimit(maxRecords, maxRecords);
  let remaining = safeMax;
  const takeSection = (exportType, sectionRows) => {
    if (remaining < 1) {
      return [];
    }

    const section = mapRows(exportType, sectionRows || [], salt, remaining);
    remaining -= section.length;
    return section;
  };
  const sections = {
    semantic: takeSection("semantic_summary", rows.semantic),
    grid: takeSection("grid_signal_summary", rows.grid),
    proposal: takeSection("dispatch_proposal_summary", rows.proposal),
    approval: takeSection("approval_audit_summary", rows.approval),
    mock: takeSection("mock_dispatch_summary", rows.mock)
  };
  const recordCount = Object.values(sections).reduce((sum, section) => sum + section.length, 0);

  return {
    export_type: "full_pipeline_demo_summary",
    generated_at: generatedAt || new Date().toISOString(),
    access_policy: ACCESS_POLICY,
    minimization_applied: true,
    pseudonymization_applied: true,
    community_id: communityId || null,
    record_count: recordCount,
    data: sections,
    limitations: LIMITATIONS,
    no_raw_private_payloads: true
  };
}

function buildAuditPayload({ payload, requester, assetId, correlationId, status = "exported" }) {
  return {
    event_time: payload.generated_at,
    export_type: payload.export_type,
    requester_id: requester.requester_id,
    requester_role: requester.requester_role,
    community_id: payload.community_id,
    asset_id: assetId,
    record_count: payload.record_count,
    access_policy: payload.access_policy,
    minimization_applied: true,
    pseudonymization_applied: true,
    export_status: status,
    no_raw_private_payloads: true,
    correlation_id: correlationId,
    message:
      "Dataspace export foundation returned minimized and pseudonymized summary data only."
  };
}

module.exports = {
  buildAuditPayload,
  buildExportPayload,
  buildFullPipelineDemoPayload,
  mapApprovalAuditRow,
  mapDispatchProposalRow,
  mapGridSignalRow,
  mapMockDispatchRow,
  mapSemanticRow
};
