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

async function ensureDispatchApprovalAuditTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_approval_audit (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      dispatch_command_id BIGINT NOT NULL,
      proposal_id TEXT,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      action TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewer_role TEXT NOT NULL,
      comment TEXT,
      approval_payload JSONB NOT NULL,
      source_dispatch_command JSONB,
      audit_payload JSONB NOT NULL,
      correlation_id TEXT,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('dispatch_approval_audit', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_approval_audit_command_time_idx
      ON dispatch_approval_audit (dispatch_command_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_approval_audit_status_time_idx
      ON dispatch_approval_audit (new_status, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_approval_audit_correlation_id_idx
      ON dispatch_approval_audit (correlation_id)
  `);
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 25;
  }
  return Math.min(parsed, 100);
}

async function listDispatchCommands(pool, limit = 25) {
  const result = await pool.query(
    `
      SELECT *
      FROM dispatch_commands
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [normalizeLimit(limit)]
  );

  return result.rows || [];
}

async function getDispatchCommandById(pool, id) {
  const result = await pool.query(
    `
      SELECT *
      FROM dispatch_commands
      WHERE id = $1
      ORDER BY event_time DESC
      LIMIT 1
    `,
    [id]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function updateDispatchCommandStatus(pool, id, previousStatus, newStatus, auditPayload) {
  const result = await pool.query(
    `
      UPDATE dispatch_commands
      SET status = $3,
          audit_payload = $4::jsonb
      WHERE id = $1
        AND status = $2
      RETURNING *
    `,
    [id, previousStatus, newStatus, JSON.stringify(auditPayload)]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function insertDispatchApprovalAudit(pool, auditEvent) {
  const result = await pool.query(
    `
      INSERT INTO dispatch_approval_audit (
        event_time,
        created_at,
        dispatch_command_id,
        proposal_id,
        previous_status,
        new_status,
        action,
        reviewer_id,
        reviewer_role,
        comment,
        approval_payload,
        source_dispatch_command,
        audit_payload,
        correlation_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14
      )
      RETURNING id, event_time, created_at
    `,
    [
      auditEvent.event_time,
      auditEvent.created_at,
      auditEvent.dispatch_command_id,
      auditEvent.proposal_id,
      auditEvent.previous_status,
      auditEvent.new_status,
      auditEvent.action,
      auditEvent.reviewer_id,
      auditEvent.reviewer_role,
      auditEvent.comment,
      JSON.stringify(auditEvent.approval_payload),
      auditEvent.source_dispatch_command
        ? JSON.stringify(auditEvent.source_dispatch_command)
        : null,
      JSON.stringify(auditEvent.audit_payload),
      auditEvent.correlation_id
    ]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

module.exports = {
  createPool,
  ensureDispatchApprovalAuditTable,
  getDispatchCommandById,
  insertDispatchApprovalAudit,
  listDispatchCommands,
  updateDispatchCommandStatus
};
