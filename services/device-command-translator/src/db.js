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

async function ensureDeviceCommandAuditTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_command_audit (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      command_id TEXT,
      proposal_id TEXT,
      device_id TEXT,
      device_type TEXT,
      provider TEXT,
      community_id TEXT,
      area_id TEXT,
      requested_reduction_kw DOUBLE PRECISION,
      allocated_reduction_kw DOUBLE PRECISION,
      action TEXT,
      translated_command JSONB,
      simulated_response JSONB,
      execution_mode TEXT NOT NULL DEFAULT 'simulated_device_api',
      no_real_execution BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL,
      correlation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (event_time, id),
      CONSTRAINT device_command_audit_no_real_execution_chk CHECK (no_real_execution = TRUE)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('device_command_audit', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_command_audit_created_at_idx
      ON device_command_audit (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_command_audit_device_time_idx
      ON device_command_audit (device_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_command_audit_status_time_idx
      ON device_command_audit (status, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_command_audit_correlation_id_idx
      ON device_command_audit (correlation_id)
  `);
}

async function insertDeviceCommandAudit(pool, event) {
  const result = await pool.query(
    `
      INSERT INTO device_command_audit (
        event_time,
        command_id,
        proposal_id,
        device_id,
        device_type,
        provider,
        community_id,
        area_id,
        requested_reduction_kw,
        allocated_reduction_kw,
        action,
        translated_command,
        simulated_response,
        execution_mode,
        no_real_execution,
        status,
        correlation_id,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12::jsonb, $13::jsonb, $14,
        TRUE, $15, $16, $17
      )
      RETURNING id, event_time, created_at
    `,
    [
      event.event_time,
      event.command_id,
      event.proposal_id,
      event.device_id,
      event.device_type,
      event.provider,
      event.community_id,
      event.area_id,
      event.requested_reduction_kw,
      event.allocated_reduction_kw,
      event.action,
      event.translated_command ? JSON.stringify(event.translated_command) : null,
      event.simulated_response ? JSON.stringify(event.simulated_response) : null,
      event.execution_mode,
      event.status,
      event.correlation_id,
      event.created_at || event.event_time
    ]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function safeInsertDeviceCommandAudit(pool, event) {
  try {
    return await insertDeviceCommandAudit(pool, event);
  } catch (error) {
    console.error("Could not store device command audit row:", error);
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

async function listDeviceCommandAudit(pool, limit = 25) {
  const result = await pool.query(
    `
      SELECT *
      FROM device_command_audit
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [normalizeLimit(limit)]
  );

  return result.rows || [];
}

module.exports = {
  createPool,
  ensureDeviceCommandAuditTable,
  insertDeviceCommandAudit,
  listDeviceCommandAudit,
  safeInsertDeviceCommandAudit
};
