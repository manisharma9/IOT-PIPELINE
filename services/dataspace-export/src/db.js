"use strict";

const { Pool } = require("pg");
const { normalizeRequestedLimit } = require("./policy");

function createPool() {
  return new Pool({
    host: process.env.TIMESCALE_HOST || process.env.TIMESCALEDB_HOST || "localhost",
    port: Number(process.env.TIMESCALE_PORT || process.env.TIMESCALEDB_PORT || 5432),
    database: process.env.TIMESCALE_DB || process.env.TIMESCALEDB_DB || "energy_flex",
    user: process.env.TIMESCALE_USER || process.env.TIMESCALEDB_USER || "energy_user",
    password:
      process.env.TIMESCALE_PASSWORD || process.env.TIMESCALEDB_PASSWORD || "energy_password",
    max: Number(process.env.TIMESCALE_POOL_SIZE || 10)
  });
}

async function ensureDataspaceExportsTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dataspace_exports (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      export_type TEXT NOT NULL,
      requester_id TEXT,
      requester_role TEXT,
      community_id TEXT,
      asset_id TEXT,
      record_count INTEGER NOT NULL DEFAULT 0,
      access_policy TEXT NOT NULL,
      minimization_applied BOOLEAN NOT NULL DEFAULT TRUE,
      pseudonymization_applied BOOLEAN NOT NULL DEFAULT TRUE,
      export_status TEXT NOT NULL,
      export_payload JSONB NOT NULL,
      audit_payload JSONB NOT NULL,
      correlation_id TEXT,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('dataspace_exports', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataspace_exports_created_at_idx
      ON dataspace_exports (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataspace_exports_type_time_idx
      ON dataspace_exports (export_type, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataspace_exports_community_time_idx
      ON dataspace_exports (community_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataspace_exports_status_time_idx
      ON dataspace_exports (export_status, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataspace_exports_correlation_id_idx
      ON dataspace_exports (correlation_id)
  `);
}

function limitFor(options = {}) {
  return normalizeRequestedLimit(options.limit, options.maxRecords || process.env.DATASPACE_MAX_RECORDS);
}

async function getSemanticSummary(pool, options = {}) {
  const result = await pool.query(
    `
      SELECT event_time, processed_at, household_id, community_id, device_id, device_type,
             reading_name, reading_unit, saref_type, saref_property, saref_unit,
             saref4ener_concept, ngsi_type, ngsi_property, mapping_source,
             mapping_confidence, explanation, correlation_id
      FROM semantic_events
      WHERE ($1::text IS NULL OR community_id = $1)
      ORDER BY processed_at DESC
      LIMIT $2
    `,
    [options.communityId || null, limitFor(options)]
  );

  return result.rows || [];
}

async function getGridSignalSummary(pool, options = {}) {
  const result = await pool.query(
    `
      SELECT event_time, processed_at, community_id, reading_name, resource_type,
             translation_status, translation_confidence, explanation, correlation_id,
             ieee20305_payload #>> '{signal,id}' AS signal_id,
             ieee20305_payload #>> '{dso,id}' AS dso_id,
             ieee20305_payload #>> '{signal,type}' AS signal_type,
             ieee20305_payload #>> '{signal,severity}' AS severity,
             ieee20305_payload #>> '{signal,requested_action}' AS requested_action
      FROM ieee20305_events
      WHERE resource_type = 'GridSignal'
        AND ($1::text IS NULL OR community_id = $1)
      ORDER BY processed_at DESC
      LIMIT $2
    `,
    [options.communityId || null, limitFor(options)]
  );

  return result.rows || [];
}

async function getDispatchProposalSummary(pool, options = {}) {
  const result = await pool.query(
    `
      SELECT id, event_time, created_at, signal_id, community_id, household_id, device_id,
             proposal_type, requested_action, proposed_action, target_kw, start_time,
             end_time, priority, status, reason, correlation_id
      FROM dispatch_commands
      WHERE ($1::text IS NULL OR community_id = $1)
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [options.communityId || null, limitFor(options)]
  );

  return result.rows || [];
}

async function getApprovalAuditSummary(pool, options = {}) {
  const result = await pool.query(
    `
      SELECT audit.event_time, audit.created_at, audit.dispatch_command_id, audit.proposal_id,
             audit.previous_status, audit.new_status, audit.action, audit.reviewer_role,
             audit.comment, audit.correlation_id
      FROM dispatch_approval_audit audit
      LEFT JOIN dispatch_commands command
        ON command.id = audit.dispatch_command_id
      WHERE ($1::text IS NULL OR command.community_id = $1)
      ORDER BY audit.created_at DESC
      LIMIT $2
    `,
    [options.communityId || null, limitFor(options)]
  );

  return result.rows || [];
}

async function getMockDispatchSummary(pool, options = {}) {
  const result = await pool.query(
    `
      SELECT event_time, created_at, dispatch_command_id, proposal_id, community_id,
             household_id, device_id, requested_action, proposed_action, mock_device_type,
             mock_command_payload ->> 'command' AS command,
             mock_command_payload ->> 'safety_note' AS safety_note,
             simulation_status, simulation_message, no_real_execution, execution_mode,
             correlation_id
      FROM dispatch_execution_audit
      WHERE ($1::text IS NULL OR community_id = $1)
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [options.communityId || null, limitFor(options)]
  );

  return result.rows || [];
}

async function getFullPipelineDemoSummary(pool, options = {}) {
  const limit = limitFor(options);
  const queryOptions = { ...options, limit };
  const [semantic, grid, proposal, approval, mock] = await Promise.all([
    getSemanticSummary(pool, queryOptions),
    getGridSignalSummary(pool, queryOptions),
    getDispatchProposalSummary(pool, queryOptions),
    getApprovalAuditSummary(pool, queryOptions),
    getMockDispatchSummary(pool, queryOptions)
  ]);

  return {
    semantic,
    grid,
    proposal,
    approval,
    mock
  };
}

async function insertExportAudit(pool, event) {
  const result = await pool.query(
    `
      INSERT INTO dataspace_exports (
        event_time,
        created_at,
        export_type,
        requester_id,
        requester_role,
        community_id,
        asset_id,
        record_count,
        access_policy,
        minimization_applied,
        pseudonymization_applied,
        export_status,
        export_payload,
        audit_payload,
        correlation_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15
      )
      RETURNING id, event_time, created_at
    `,
    [
      event.event_time,
      event.created_at,
      event.export_type,
      event.requester_id,
      event.requester_role,
      event.community_id,
      event.asset_id,
      event.record_count,
      event.access_policy,
      event.minimization_applied,
      event.pseudonymization_applied,
      event.export_status,
      JSON.stringify(event.export_payload),
      JSON.stringify(event.audit_payload),
      event.correlation_id
    ]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function safeInsertExportAudit(pool, event) {
  try {
    return await insertExportAudit(pool, event);
  } catch (error) {
    console.error("Could not store dataspace export audit row:", error);
    return null;
  }
}

module.exports = {
  createPool,
  ensureDataspaceExportsTable,
  getApprovalAuditSummary,
  getDispatchProposalSummary,
  getFullPipelineDemoSummary,
  getGridSignalSummary,
  getMockDispatchSummary,
  getSemanticSummary,
  insertExportAudit,
  safeInsertExportAudit
};
