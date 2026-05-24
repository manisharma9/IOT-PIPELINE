"use strict";

const { Pool } = require("pg");

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

async function ensureDispatchExecutionAuditTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_execution_audit (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      dispatch_command_id BIGINT,
      proposal_id TEXT,
      community_id TEXT,
      household_id TEXT,
      device_id TEXT,
      requested_action TEXT,
      proposed_action TEXT,
      mock_device_type TEXT NOT NULL,
      mock_command_payload JSONB NOT NULL,
      mock_result_payload JSONB NOT NULL,
      simulation_status TEXT NOT NULL,
      simulation_message TEXT NOT NULL,
      no_real_execution BOOLEAN NOT NULL DEFAULT TRUE,
      execution_mode TEXT NOT NULL DEFAULT 'mock',
      source_ready_event JSONB,
      audit_payload JSONB NOT NULL,
      correlation_id TEXT,
      PRIMARY KEY (event_time, id),
      CONSTRAINT dispatch_execution_audit_no_real_execution_chk CHECK (no_real_execution = TRUE),
      CONSTRAINT dispatch_execution_audit_execution_mode_chk CHECK (execution_mode = 'mock')
    )
  `);
  await pool.query(
    "SELECT create_hypertable('dispatch_execution_audit', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_execution_audit_created_at_idx
      ON dispatch_execution_audit (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_execution_audit_command_time_idx
      ON dispatch_execution_audit (dispatch_command_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_execution_audit_status_time_idx
      ON dispatch_execution_audit (simulation_status, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_execution_audit_correlation_id_idx
      ON dispatch_execution_audit (correlation_id)
  `);
}

async function insertDispatchExecutionAudit(pool, event) {
  const result = await pool.query(
    `
      INSERT INTO dispatch_execution_audit (
        event_time,
        created_at,
        dispatch_command_id,
        proposal_id,
        community_id,
        household_id,
        device_id,
        requested_action,
        proposed_action,
        mock_device_type,
        mock_command_payload,
        mock_result_payload,
        simulation_status,
        simulation_message,
        no_real_execution,
        execution_mode,
        source_ready_event,
        audit_payload,
        correlation_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11::jsonb, $12::jsonb, $13, $14,
        $15, $16, $17::jsonb, $18::jsonb, $19
      )
      RETURNING id, event_time, created_at
    `,
    [
      event.event_time,
      event.created_at,
      event.dispatch_command_id,
      event.proposal_id,
      event.community_id,
      event.household_id,
      event.device_id,
      event.requested_action,
      event.proposed_action,
      event.mock_device_type,
      JSON.stringify(event.mock_command_payload),
      JSON.stringify(event.mock_result_payload),
      event.simulation_status,
      event.simulation_message,
      true,
      "mock",
      event.source_ready_event ? JSON.stringify(event.source_ready_event) : null,
      JSON.stringify(event.audit_payload),
      event.correlation_id
    ]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function safeInsertDispatchExecutionAudit(pool, event) {
  try {
    return await insertDispatchExecutionAudit(pool, event);
  } catch (error) {
    console.error("Could not store mock dispatch audit row:", error);
    return null;
  }
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 25;
  }
  return Math.min(parsed, 100);
}

async function listDispatchExecutionAudit(pool, limit = 25) {
  const result = await pool.query(
    `
      SELECT *
      FROM dispatch_execution_audit
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [normalizeLimit(limit)]
  );

  return result.rows || [];
}

async function getDispatchExecutionAuditById(pool, id) {
  const result = await pool.query(
    `
      SELECT *
      FROM dispatch_execution_audit
      WHERE id = $1
      ORDER BY event_time DESC
      LIMIT 1
    `,
    [id]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

module.exports = {
  createPool,
  ensureDispatchExecutionAuditTable,
  getDispatchExecutionAuditById,
  insertDispatchExecutionAudit,
  listDispatchExecutionAudit,
  safeInsertDispatchExecutionAudit
};
