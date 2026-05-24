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

async function ensureDispatchCommandsTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_commands (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source_topic TEXT NOT NULL,
      output_topic TEXT NOT NULL,
      signal_id TEXT,
      dso_id TEXT,
      community_id TEXT NOT NULL,
      household_id TEXT,
      device_id TEXT,
      proposal_type TEXT NOT NULL,
      requested_action TEXT NOT NULL,
      proposed_action TEXT NOT NULL,
      target_kw DOUBLE PRECISION,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      reason TEXT NOT NULL,
      decision_payload JSONB NOT NULL,
      source_grid_signal JSONB,
      source_ieee20305_payload JSONB,
      audit_payload JSONB NOT NULL,
      correlation_id TEXT,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('dispatch_commands', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_commands_created_at_idx
      ON dispatch_commands (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_commands_community_time_idx
      ON dispatch_commands (community_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_commands_status_time_idx
      ON dispatch_commands (status, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_commands_signal_id_idx
      ON dispatch_commands (signal_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS dispatch_commands_correlation_id_idx
      ON dispatch_commands (correlation_id)
  `);
}

async function insertDispatchCommandProposal(pool, proposal) {
  const result = await pool.query(
    `
      INSERT INTO dispatch_commands (
        event_time,
        created_at,
        source_topic,
        output_topic,
        signal_id,
        dso_id,
        community_id,
        household_id,
        device_id,
        proposal_type,
        requested_action,
        proposed_action,
        target_kw,
        start_time,
        end_time,
        priority,
        status,
        reason,
        decision_payload,
        source_grid_signal,
        source_ieee20305_payload,
        audit_payload,
        correlation_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23
      )
      RETURNING id, event_time, created_at
    `,
    [
      proposal.event_time,
      proposal.created_at,
      proposal.source_topic,
      proposal.output_topic,
      proposal.signal_id,
      proposal.dso_id,
      proposal.community_id,
      proposal.household_id,
      proposal.device_id,
      proposal.proposal_type,
      proposal.requested_action,
      proposal.proposed_action,
      proposal.target_kw,
      proposal.start_time,
      proposal.end_time,
      proposal.priority,
      proposal.status,
      proposal.reason,
      JSON.stringify(proposal.decision_payload),
      proposal.source_grid_signal ? JSON.stringify(proposal.source_grid_signal) : null,
      proposal.source_ieee20305_payload
        ? JSON.stringify(proposal.source_ieee20305_payload)
        : null,
      JSON.stringify(proposal.audit_payload),
      proposal.correlation_id
    ]
  );

  return result.rows && result.rows[0] ? result.rows[0] : null;
}

async function safeInsertDispatchCommandProposal(pool, proposal) {
  try {
    return await insertDispatchCommandProposal(pool, proposal);
  } catch (error) {
    console.error("Could not store dispatch command proposal:", error);
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

async function listDispatchProposals(pool, limit = 25) {
  const safeLimit = normalizeLimit(limit);
  const result = await pool.query(
    `
      SELECT *
      FROM dispatch_commands
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows || [];
}

async function getDispatchProposalById(pool, id) {
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

module.exports = {
  createPool,
  ensureDispatchCommandsTable,
  getDispatchProposalById,
  insertDispatchCommandProposal,
  listDispatchProposals,
  safeInsertDispatchCommandProposal
};
