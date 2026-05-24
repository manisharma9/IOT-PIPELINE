"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAuditPayload,
  buildExportPayload,
  buildFullPipelineDemoPayload
} = require("../src/export-builder");
const { buildCatalogMetadata } = require("../src/policy");

function semanticRows() {
  return [
    {
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
      semantic_payload: {
        original: "must not be exported"
      },
      correlation_id: "raw.telemetry:0:1"
    },
    {
      event_time: "2026-05-24T18:01:00.000Z",
      processed_at: "2026-05-24T18:01:01.000Z",
      household_id: "household-002",
      community_id: "community-dublin-north",
      device_id: "meter-002",
      device_type: "smart_meter",
      reading_name: "voltage_v",
      reading_unit: "V",
      saref_type: "saref:Measurement",
      saref_property: "saref:Voltage",
      saref_unit: "unit:V",
      saref4ener_concept: "Voltage",
      ngsi_type: "Property",
      ngsi_property: "voltage",
      mapping_source: "deterministic",
      mapping_confidence: "high",
      explanation: "Known deterministic mapping.",
      correlation_id: "raw.telemetry:0:2"
    }
  ];
}

test("semantic summary export applies minimization", () => {
  const payload = buildExportPayload({
    exportType: "semantic_summary",
    communityId: "community-dublin-north",
    rows: semanticRows(),
    salt: "test-salt",
    generatedAt: "2026-05-24T20:00:00.000Z",
    maxRecords: 10
  });

  assert.equal(payload.minimization_applied, true);
  assert.equal(payload.pseudonymization_applied, true);
  assert.equal(payload.no_raw_private_payloads, true);
  assert.equal(payload.data[0].reading_name, "active_power_kw");
  assert.equal(Object.hasOwn(payload.data[0], "semantic_payload"), false);
});

test("household_id and device_id are pseudonymized", () => {
  const payload = buildExportPayload({
    exportType: "semantic_summary",
    communityId: "community-dublin-north",
    rows: semanticRows(),
    salt: "test-salt",
    generatedAt: "2026-05-24T20:00:00.000Z",
    maxRecords: 10
  });

  assert.match(payload.data[0].household_ref, /^household_[a-f0-9]{12}$/);
  assert.match(payload.data[0].device_ref, /^device_[a-f0-9]{12}$/);
  assert.equal(JSON.stringify(payload).includes("household-001"), false);
  assert.equal(JSON.stringify(payload).includes("meter-001"), false);
});

test("raw telemetry payload is not exposed", () => {
  const payload = buildExportPayload({
    exportType: "semantic_summary",
    communityId: "community-dublin-north",
    rows: semanticRows(),
    salt: "test-salt",
    generatedAt: "2026-05-24T20:00:00.000Z",
    maxRecords: 10
  });
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes("raw_payload"), false);
  assert.equal(serialized.includes("semantic_payload"), false);
  assert.equal(serialized.includes("original"), false);
});

test("DATASPACE_MAX_RECORDS is respected", () => {
  const payload = buildExportPayload({
    exportType: "semantic_summary",
    communityId: "community-dublin-north",
    rows: semanticRows(),
    salt: "test-salt",
    generatedAt: "2026-05-24T20:00:00.000Z",
    maxRecords: 1
  });

  assert.equal(payload.record_count, 1);
  assert.equal(payload.data.length, 1);
});

test("audit payload is created", () => {
  const payload = buildExportPayload({
    exportType: "semantic_summary",
    communityId: "community-dublin-north",
    rows: semanticRows(),
    salt: "test-salt",
    generatedAt: "2026-05-24T20:00:00.000Z",
    maxRecords: 1
  });
  const audit = buildAuditPayload({
    payload,
    requester: {
      requester_id: "test-client",
      requester_role: "tester"
    },
    assetId: "semantic-summary",
    correlationId: "dataspace-test"
  });

  assert.equal(audit.export_type, "semantic_summary");
  assert.equal(audit.no_raw_private_payloads, true);
  assert.equal(audit.record_count, 1);
});

test("catalog publish creates a catalog event payload", () => {
  const catalog = buildCatalogMetadata({
    generatedAt: "2026-05-24T20:00:00.000Z"
  });

  assert.equal(catalog.foundation_only, true);
  assert.equal(catalog.enershare_certified_connector, false);
  assert.equal(catalog.assets.some((asset) => asset.id === "semantic-summary"), true);
});

test("full pipeline demo summary includes semantic, grid, proposal, approval, and mock sections", () => {
  const payload = buildFullPipelineDemoPayload({
    communityId: "community-dublin-north",
    salt: "test-salt",
    generatedAt: "2026-05-24T20:00:00.000Z",
    maxRecords: 10,
    rows: {
      semantic: semanticRows().slice(0, 1),
      grid: [
        {
          event_time: "2026-05-24T18:00:00.000Z",
          community_id: "community-dublin-north",
          resource_type: "GridSignal",
          signal_id: "signal-001",
          signal_type: "curtailment_request",
          severity: "medium",
          requested_action: "reduce_load",
          translation_status: "translated"
        }
      ],
      proposal: [
        {
          id: 1,
          event_time: "2026-05-24T18:00:00.000Z",
          created_at: "2026-05-24T18:00:01.000Z",
          community_id: "community-dublin-north",
          requested_action: "reduce_load",
          proposed_action: "reduce_ev_charging",
          status: "ready_to_dispatch"
        }
      ],
      approval: [
        {
          event_time: "2026-05-24T18:02:00.000Z",
          previous_status: "approved",
          new_status: "ready_to_dispatch",
          action: "mark-ready",
          reviewer_role: "mentor",
          comment: "hidden comment"
        }
      ],
      mock: [
        {
          event_time: "2026-05-24T18:03:00.000Z",
          community_id: "community-dublin-north",
          proposed_action: "reduce_ev_charging",
          mock_device_type: "ev_charger",
          command: "set_charging_limit",
          simulation_status: "simulated_success",
          no_real_execution: true,
          execution_mode: "mock"
        }
      ]
    }
  });

  assert.equal(payload.data.semantic.length, 1);
  assert.equal(payload.data.grid.length, 1);
  assert.equal(payload.data.proposal.length, 1);
  assert.equal(payload.data.approval.length, 1);
  assert.equal(payload.data.mock.length, 1);
  assert.equal(payload.record_count, 5);
});
