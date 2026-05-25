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

async function ensureSecurityGatewayAuditTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_gateway_audit (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      correlation_id TEXT,
      client_ip TEXT,
      method TEXT,
      route TEXT,
      decision TEXT NOT NULL,
      reason TEXT,
      status_code INTEGER,
      target_service TEXT,
      request_hash TEXT,
      user_agent TEXT,
      api_key_id TEXT,
      auth_mode TEXT,
      audit_payload JSONB,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('security_gateway_audit', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS security_gateway_audit_created_at_idx
      ON security_gateway_audit (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS security_gateway_audit_decision_time_idx
      ON security_gateway_audit (decision, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS security_gateway_audit_correlation_id_idx
      ON security_gateway_audit (correlation_id)
  `);
}

async function insertSecurityGatewayAudit(pool, event) {
  const result = await pool.query(
    `
      INSERT INTO security_gateway_audit (
        event_time,
        created_at,
        correlation_id,
        client_ip,
        method,
        route,
        decision,
        reason,
        status_code,
        target_service,
        request_hash,
        user_agent,
        api_key_id,
        auth_mode,
        audit_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15::jsonb
      )
      RETURNING id, event_time, created_at
    `,
    [
      event.event_time,
      event.created_at || event.event_time,
      event.correlation_id,
      event.client_ip,
      event.method,
      event.route,
      event.decision,
      event.reason,
      event.status_code,
      event.target_service,
      event.request_hash,
      event.user_agent,
      event.api_key_id,
      event.auth_mode,
      event.audit_payload ? JSON.stringify(event.audit_payload) : null
    ]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function safeInsertSecurityGatewayAudit(pool, event) {
  try {
    return await insertSecurityGatewayAudit(pool, event);
  } catch (error) {
    console.error("Could not store security gateway audit row:", error);
    return null;
  }
}

module.exports = {
  createPool,
  ensureSecurityGatewayAuditTable,
  insertSecurityGatewayAudit,
  safeInsertSecurityGatewayAudit
};
