"use strict";

const ACCESS_POLICY =
  "local-development API key required; IDS/ENERSHARE-ready minimized community-level summaries only; not a certified ENERSHARE connector";

const LIMITATIONS = Object.freeze([
  "IDS/ENERSHARE-ready export foundation only, not a certified ENERSHARE connector.",
  "No real EDC connector, connector credentials, contract negotiation, OAuth/OIDC, or production mTLS.",
  "Raw telemetry payloads and raw household/device identifiers are not exported.",
  "Exports are capped by DATASPACE_MAX_RECORDS."
]);

const MINIMIZATION_RULES = Object.freeze([
  "Never return raw telemetry payloads.",
  "Never return raw semantic, IEEE 2030.5, approval, or mock source payloads.",
  "Pseudonymize household_id and device_id before returning data.",
  "Keep community_id visible as a community-level grouping.",
  "Include only timestamps, statuses, resource types, actions, semantic labels, and safety flags.",
  "Limit rows using DATASPACE_MAX_RECORDS."
]);

const ASSETS = Object.freeze([
  {
    id: "semantic-summary",
    export_type: "semantic_summary",
    name: "Semantic Summary",
    description: "Minimized SAREF4ENER/NGSI semantic mapping summary records.",
    data_categories: ["semantic_mapping", "energy_reading_metadata", "community_summary"]
  },
  {
    id: "grid-signal-summary",
    export_type: "grid_signal_summary",
    name: "Grid Signal Summary",
    description: "Minimized DSO grid signal and IEEE 2030.5-style GridSignal summary records.",
    data_categories: ["grid_signal", "community_summary", "dso_signal_metadata"]
  },
  {
    id: "dispatch-proposal-summary",
    export_type: "dispatch_proposal_summary",
    name: "Dispatch Proposal Summary",
    description: "Proposal-only aggregator decisions without command execution payloads.",
    data_categories: ["dispatch_proposal", "community_summary", "flexibility_action"]
  },
  {
    id: "approval-audit-summary",
    export_type: "approval_audit_summary",
    name: "Approval Audit Summary",
    description: "Approval workflow status transition summaries without reviewer identifiers.",
    data_categories: ["approval_audit", "status_transition", "governance_summary"]
  },
  {
    id: "mock-dispatch-summary",
    export_type: "mock_dispatch_summary",
    name: "Mock Dispatch Summary",
    description: "Simulated mock dispatch result summaries with no real device control.",
    data_categories: ["mock_dispatch", "simulation_audit", "safety_flag"]
  },
  {
    id: "full-pipeline-demo-summary",
    export_type: "full_pipeline_demo_summary",
    name: "Full Pipeline Demo Summary",
    description: "Safe demo export combining semantic, grid, proposal, approval, and mock sections.",
    data_categories: ["demo_summary", "pipeline_status", "community_summary"]
  }
]);

function getAssets() {
  return ASSETS.map((asset) => ({
    ...asset,
    access_policy: ACCESS_POLICY,
    minimization_rules: MINIMIZATION_RULES
  }));
}

function getAssetById(assetId) {
  return getAssets().find((asset) => asset.id === assetId) || null;
}

function getAssetByExportType(exportType) {
  return getAssets().find((asset) => asset.export_type === exportType) || null;
}

function isAllowedExportType(exportType) {
  return ASSETS.some((asset) => asset.export_type === exportType);
}

function normalizeMaxRecords(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 100;
  }

  return Math.min(parsed, 500);
}

function normalizeRequestedLimit(requestedLimit, maxRecords) {
  const parsed = Number(requestedLimit);
  const safeMax = normalizeMaxRecords(maxRecords);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return safeMax;
  }

  return Math.min(parsed, safeMax);
}

function buildCatalogMetadata(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();

  return {
    catalog_id: "adflex-local-dataspace-catalog",
    generated_at: generatedAt,
    service: "dataspace-export",
    foundation_only: true,
    enershare_certified_connector: false,
    message:
      "IDS/ENERSHARE-ready dataspace export foundation for minimized AD-FLEX summaries; not a certified ENERSHARE connector.",
    access_policy: ACCESS_POLICY,
    minimization_rules: MINIMIZATION_RULES,
    assets: getAssets()
  };
}

module.exports = {
  ACCESS_POLICY,
  LIMITATIONS,
  MINIMIZATION_RULES,
  buildCatalogMetadata,
  getAssetByExportType,
  getAssetById,
  getAssets,
  isAllowedExportType,
  normalizeMaxRecords,
  normalizeRequestedLimit
};
