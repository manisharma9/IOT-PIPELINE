"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
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

async function ensureCustomerDashboardReadModel(pool) {
  for (const migration of [
    "011_customer_dashboard_read_model.sql",
    "012_simulated_device_registry.sql"
  ]) {
    const migrationPath = path.resolve(
      __dirname,
      `../../../database/timescale/${migration}`
    );
    const sql = await fs.readFile(migrationPath, "utf8");
    await pool.query(sql);
  }
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

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 25;
  }
  return Math.min(parsed, 100);
}

function safeAuditRow(row) {
  return {
    id: row.id,
    event_time: row.event_time,
    created_at: row.created_at,
    correlation_id: row.correlation_id,
    method: row.method,
    route: row.route,
    decision: row.decision,
    reason: row.reason,
    status_code: row.status_code,
    target_service: row.target_service,
    request_hash: row.request_hash,
    auth_mode: row.auth_mode,
    audit_payload: row.audit_payload
      ? {
          no_raw_body_stored: row.audit_payload.no_raw_body_stored === true,
          target_url: row.audit_payload.target_url || null,
          downstream: row.audit_payload.downstream || null
        }
      : null
  };
}

async function listSecurityGatewayAudit(pool, filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.correlationId) {
    params.push(filters.correlationId);
    conditions.push(`correlation_id = $${params.length}`);
  }

  if (filters.decision) {
    params.push(filters.decision);
    conditions.push(`decision = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(normalizeLimit(filters.limit));

  const result = await pool.query(
    `
      SELECT
        id,
        event_time,
        created_at,
        correlation_id,
        method,
        route,
        decision,
        reason,
        status_code,
        target_service,
        request_hash,
        auth_mode,
        audit_payload
      FROM security_gateway_audit
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map(safeAuditRow);
}

module.exports = {
  createPool,
  ensureCustomerDashboardReadModel,
  ensureSecurityGatewayAuditTable,
  insertSecurityGatewayAudit,
  listSecurityGatewayAudit,
  safeAuditRow,
  safeInsertSecurityGatewayAudit
};
