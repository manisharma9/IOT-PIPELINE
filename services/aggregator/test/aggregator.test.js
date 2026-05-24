"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAuditPayload,
  createDispatchProposal,
  getTargetKwForSeverity,
  normalizeSeverity
} = require("../src/aggregator");
const { processGridSignalMessage } = require("../src/kafka");
const { validateGridSignalEvent } = require("../src/validation");

function gridSignal(overrides = {}) {
  return {
    signal_id: "signal-001",
    dso_id: "dso-dublin",
    community_id: "community-dublin-north",
    signal_type: "curtailment_request",
    severity: "medium",
    requested_action: "reduce_load",
    start_time: "2026-05-24T18:00:00Z",
    end_time: "2026-05-24T19:00:00Z",
    reason: "Local transformer load is approaching threshold",
    ...overrides
  };
}

function phase4GridSignalEvent(overrides = {}) {
  const signal = gridSignal(overrides.signal || {});

  return {
    event_time: signal.start_time,
    processed_at: "2026-05-24T17:55:00.000Z",
    source_topic: "http.post./dso/grid-signal",
    output_topic: "grid.signals",
    household_id: null,
    community_id: signal.community_id,
    device_id: null,
    device_type: null,
    reading_name: signal.signal_type,
    resource_type: "GridSignal",
    translation_status: "translated",
    translation_confidence: "high",
    explanation: "DSO grid signal translated into a GridSignal style payload.",
    correlation_id: signal.signal_id,
    ieee20305_payload: {
      resource_type: "GridSignal",
      href: `/grid-signals/${signal.signal_id}`,
      signal: {
        id: signal.signal_id,
        type: signal.signal_type,
        severity: signal.severity,
        requested_action: signal.requested_action,
        start_time: signal.start_time,
        end_time: signal.end_time,
        reason: signal.reason
      },
      dso: {
        id: signal.dso_id
      },
      community: {
        id: signal.community_id
      }
    },
    raw_semantic_payload: signal,
    ...overrides
  };
}

function kafkaMessage(payload, offset = "1") {
  return {
    offset,
    value: Buffer.from(JSON.stringify(payload))
  };
}

test("valid grid signal creates dispatch proposal", () => {
  const validation = validateGridSignalEvent(phase4GridSignalEvent());
  assert.equal(validation.valid, true);

  const proposal = createDispatchProposal(validation.value, {
    createdAt: "2026-05-24T17:56:00.000Z"
  });

  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.proposal_type, "load_reduction");
  assert.equal(proposal.requested_action, "reduce_load");
  assert.equal(proposal.proposed_action, "reduce_ev_charging");
  assert.equal(proposal.target_kw, 2.5);
  assert.equal(proposal.decision_payload.no_execution, true);
});

test("reduce_load maps to reduce_ev_charging proposal", () => {
  const proposal = createDispatchProposal(gridSignal({ requested_action: "reduce_load" }));

  assert.equal(proposal.proposed_action, "reduce_ev_charging");
});

test("shift_load maps to delay_flexible_load proposal", () => {
  const proposal = createDispatchProposal(gridSignal({ requested_action: "shift_load" }));

  assert.equal(proposal.proposed_action, "delay_flexible_load");
});

test("increase_export maps to increase_pv_export_if_available proposal", () => {
  const proposal = createDispatchProposal(gridSignal({ requested_action: "increase_export" }));

  assert.equal(proposal.proposed_action, "increase_pv_export_if_available");
});

test("reduce_export maps to reduce_export_limit proposal", () => {
  const proposal = createDispatchProposal(gridSignal({ requested_action: "reduce_export" }));

  assert.equal(proposal.proposed_action, "reduce_export_limit");
});

test("severity maps to target_kw correctly with medium fallback", () => {
  assert.equal(getTargetKwForSeverity("low"), 1.0);
  assert.equal(getTargetKwForSeverity("medium"), 2.5);
  assert.equal(getTargetKwForSeverity("high"), 5.0);
  assert.equal(getTargetKwForSeverity("critical"), 7.5);
  assert.equal(getTargetKwForSeverity("unexpected"), 2.5);
  assert.equal(normalizeSeverity("unexpected"), "medium");
});

test("invalid grid signal does not create proposal and publishes failed audit", async () => {
  let dbCalled = false;
  const kafkaWrites = [];
  const result = await processGridSignalMessage({
    topic: "grid.signals",
    partition: 0,
    message: kafkaMessage(gridSignal({ requested_action: "disconnect_households" })),
    pool: {
      query: async () => {
        dbCalled = true;
      }
    },
    producer: {
      send: async (message) => {
        kafkaWrites.push(message);
      }
    },
    createdAt: "2026-05-24T18:00:00.000Z"
  });

  assert.equal(result.status, "rejected");
  assert.equal(dbCalled, false);
  assert.equal(kafkaWrites.length, 1);
  assert.equal(kafkaWrites[0].topic, "dispatch.command.audit");

  const audit = JSON.parse(kafkaWrites[0].messages[0].value);
  assert.equal(audit.status, "failed");
  assert.equal(audit.no_execution, true);
  assert.equal(Array.isArray(audit.validation_errors), true);
});

test("audit payload is created for valid proposal", () => {
  const proposal = createDispatchProposal(gridSignal(), {
    createdAt: "2026-05-24T17:56:00.000Z"
  });
  const audit = buildAuditPayload(proposal, {
    eventTime: "2026-05-24T17:56:00.000Z"
  });

  assert.equal(audit.status, "proposed");
  assert.equal(audit.proposal_id, proposal.proposal_id);
  assert.equal(audit.no_execution, true);
  assert.match(audit.message, /No command was executed/);
});

test("valid Kafka grid signal stores proposal and publishes proposal plus audit", async () => {
  const kafkaWrites = [];
  const result = await processGridSignalMessage({
    topic: "grid.signals",
    partition: 0,
    message: kafkaMessage(phase4GridSignalEvent()),
    pool: {
      query: async () => ({
        rows: [
          {
            id: 1
          }
        ]
      })
    },
    producer: {
      send: async (message) => {
        kafkaWrites.push(message);
      }
    },
    createdAt: "2026-05-24T17:56:00.000Z"
  });

  assert.equal(result.status, "processed");
  assert.equal(result.proposed_action, "reduce_ev_charging");
  assert.equal(kafkaWrites.length, 2);
  assert.equal(kafkaWrites[0].topic, "dispatch.command.proposed");
  assert.equal(kafkaWrites[1].topic, "dispatch.command.audit");

  const proposal = JSON.parse(kafkaWrites[0].messages[0].value);
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.output_topic, "dispatch.command.proposed");
});
