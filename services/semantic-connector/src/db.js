"use strict";

const { Pool } = require("pg");

function createPool() {
  return new Pool({
    host: process.env.TIMESCALE_HOST || "localhost",
    port: Number(process.env.TIMESCALE_PORT || 5432),
    database: process.env.TIMESCALE_DB || "energy_flex",
    user: process.env.TIMESCALE_USER || "energy_user",
    password: process.env.TIMESCALE_PASSWORD || "energy_password",
    max: Number(process.env.TIMESCALE_POOL_SIZE || 10)
  });
}

async function ensureSemanticEventsTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semantic_events (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      household_id TEXT NOT NULL,
      community_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_type TEXT NOT NULL,
      reading_name TEXT NOT NULL,
      reading_value DOUBLE PRECISION NOT NULL,
      reading_unit TEXT,
      saref_type TEXT NOT NULL,
      saref_property TEXT NOT NULL,
      saref_unit TEXT,
      saref4ener_concept TEXT NOT NULL,
      ngsi_type TEXT NOT NULL,
      ngsi_property TEXT NOT NULL,
      semantic_payload JSONB NOT NULL,
      mapping_source TEXT NOT NULL,
      mapping_confidence TEXT NOT NULL,
      explanation TEXT NOT NULL,
      correlation_id TEXT,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('semantic_events', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS semantic_events_device_time_idx
      ON semantic_events (device_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS semantic_events_reading_time_idx
      ON semantic_events (reading_name, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS semantic_events_mapping_source_time_idx
      ON semantic_events (mapping_source, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS semantic_events_correlation_id_idx
      ON semantic_events (correlation_id)
  `);
  await pool.query(`
    ALTER TABLE semantic_events
      ADD COLUMN IF NOT EXISTS reading_id TEXT,
      ADD COLUMN IF NOT EXISTS slm_called BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS slm_provider TEXT,
      ADD COLUMN IF NOT EXISTS slm_model TEXT,
      ADD COLUMN IF NOT EXISTS slm_confidence DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS final_status TEXT NOT NULL DEFAULT 'legacy',
      ADD COLUMN IF NOT EXISTS safely_unmapped BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS semantic_events_reading_id_time_uidx
      ON semantic_events (event_time, reading_id)
      WHERE reading_id IS NOT NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semantic_slm_audit (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      reading_id TEXT NOT NULL,
      household_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      reading_name TEXT NOT NULL,
      slm_called BOOLEAN NOT NULL,
      slm_provider TEXT NOT NULL,
      slm_model TEXT NOT NULL,
      slm_worker_id TEXT NOT NULL,
      slm_batch_id TEXT NOT NULL,
      slm_request_id TEXT,
      slm_attempt_count INTEGER NOT NULL,
      slm_inference_started_at TIMESTAMPTZ,
      slm_inference_completed_at TIMESTAMPTZ,
      slm_inference_latency_ms DOUBLE PRECISION,
      slm_output_received BOOLEAN NOT NULL,
      slm_mapping JSONB,
      slm_confidence DOUBLE PRECISION,
      deterministic_validation JSONB NOT NULL,
      validation_failure_reason TEXT,
      final_status TEXT NOT NULL,
      safely_unmapped BOOLEAN NOT NULL,
      inference_server_identity TEXT,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      audit_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('semantic_slm_audit', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS semantic_slm_audit_reading_id_time_uidx
      ON semantic_slm_audit (event_time, reading_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS semantic_slm_audit_batch_time_idx
      ON semantic_slm_audit (slm_batch_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS semantic_slm_audit_status_time_idx
      ON semantic_slm_audit (final_status, event_time DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semantic_batch_metrics (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
      slm_batch_id TEXT NOT NULL,
      slm_worker_id TEXT NOT NULL,
      slm_provider TEXT NOT NULL,
      slm_model TEXT NOT NULL,
      inference_server_identity TEXT,
      input_readings INTEGER NOT NULL,
      mapped_readings INTEGER NOT NULL,
      safely_unmapped_readings INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL,
      queue_time_ms DOUBLE PRECISION,
      inference_latency_ms DOUBLE PRECISION,
      database_latency_ms DOUBLE PRECISION,
      total_latency_ms DOUBLE PRECISION,
      status TEXT NOT NULL,
      metrics_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('semantic_batch_metrics', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS semantic_batch_metrics_batch_time_uidx
      ON semantic_batch_metrics (event_time, slm_batch_id)
  `);
}

async function insertSemanticEvent(pool, event) {
  const result = await pool.query(
    `
      INSERT INTO semantic_events (
        event_time,
        processed_at,
        household_id,
        community_id,
        device_id,
        device_type,
        reading_name,
        reading_value,
        reading_unit,
        saref_type,
        saref_property,
        saref_unit,
        saref4ener_concept,
        ngsi_type,
        ngsi_property,
        semantic_payload,
        mapping_source,
        mapping_confidence,
        explanation,
        correlation_id,
        reading_id,
        slm_called,
        slm_provider,
        slm_model,
        slm_confidence,
        final_status,
        safely_unmapped
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27
      )
      ON CONFLICT (event_time, reading_id) WHERE reading_id IS NOT NULL DO NOTHING
      RETURNING id
    `,
    [
      event.event_time,
      event.processed_at,
      event.household_id,
      event.community_id,
      event.device_id,
      event.device_type,
      event.reading_name,
      event.reading_value,
      event.reading_unit,
      event.saref_type,
      event.saref_property,
      event.saref_unit,
      event.saref4ener_concept,
      event.ngsi_type,
      event.ngsi_property,
      JSON.stringify(event.semantic_payload),
      event.mapping_source,
      event.mapping_confidence,
      event.explanation,
      event.correlation_id,
      event.reading_id || null,
      Boolean(event.slm_called),
      event.slm_provider || null,
      event.slm_model || null,
      event.slm_confidence ?? null,
      event.final_status || "mapped",
      Boolean(event.safely_unmapped)
    ]
  );
  return result.rowCount > 0;
}

async function insertSlmAudit(client, audit) {
  const result = await client.query(
    `
      INSERT INTO semantic_slm_audit (
        event_time, reading_id, household_id, device_id, reading_name,
        slm_called, slm_provider, slm_model, slm_worker_id, slm_batch_id,
        slm_request_id, slm_attempt_count, slm_inference_started_at,
        slm_inference_completed_at, slm_inference_latency_ms, slm_output_received,
        slm_mapping, slm_confidence, deterministic_validation,
        validation_failure_reason, final_status, safely_unmapped,
        inference_server_identity, processed_at, audit_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19::jsonb,
        $20, $21, $22, $23, $24, $25::jsonb
      )
      ON CONFLICT (event_time, reading_id) DO NOTHING
      RETURNING id
    `,
    [
      audit.event_time,
      audit.reading_id,
      audit.household_id,
      audit.device_id,
      audit.reading_name,
      audit.slm_called,
      audit.slm_provider,
      audit.slm_model,
      audit.slm_worker_id,
      audit.slm_batch_id,
      audit.slm_request_id,
      audit.slm_attempt_count,
      audit.slm_inference_started_at,
      audit.slm_inference_completed_at,
      audit.slm_inference_latency_ms,
      audit.slm_output_received,
      audit.slm_mapping ? JSON.stringify(audit.slm_mapping) : null,
      audit.slm_confidence,
      JSON.stringify(audit.deterministic_validation || {}),
      audit.validation_failure_reason,
      audit.final_status,
      audit.safely_unmapped,
      audit.inference_server_identity,
      audit.processed_at,
      JSON.stringify(audit.audit_payload || {})
    ]
  );
  return result.rowCount > 0;
}

async function insertSemanticOutcome(pool, semanticEvent, audit) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const semanticInserted = semanticEvent ? await insertSemanticEvent(client, semanticEvent) : false;
    const auditInserted = await insertSlmAudit(client, audit);
    await client.query("COMMIT");
    return { semanticInserted, auditInserted, duplicate: !auditInserted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertBatchMetrics(pool, metrics) {
  await pool.query(
    `
      INSERT INTO semantic_batch_metrics (
        event_time, slm_batch_id, slm_worker_id, slm_provider, slm_model,
        inference_server_identity, input_readings, mapped_readings,
        safely_unmapped_readings, attempt_count, queue_time_ms,
        inference_latency_ms, database_latency_ms, total_latency_ms,
        status, metrics_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
      ON CONFLICT (event_time, slm_batch_id) DO NOTHING
    `,
    [
      metrics.event_time,
      metrics.slm_batch_id,
      metrics.slm_worker_id,
      metrics.slm_provider,
      metrics.slm_model,
      metrics.inference_server_identity,
      metrics.input_readings,
      metrics.mapped_readings,
      metrics.safely_unmapped_readings,
      metrics.attempt_count,
      metrics.queue_time_ms,
      metrics.inference_latency_ms,
      metrics.database_latency_ms,
      metrics.total_latency_ms,
      metrics.status,
      JSON.stringify(metrics.metrics_payload || {})
    ]
  );
}

module.exports = {
  createPool,
  ensureSemanticEventsTable,
  insertBatchMetrics,
  insertSemanticEvent,
  insertSemanticOutcome,
  insertSlmAudit
};
