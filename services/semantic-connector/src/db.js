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
}

async function insertSemanticEvent(pool, event) {
  await pool.query(
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
        correlation_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20
      )
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
      event.correlation_id
    ]
  );
}

module.exports = {
  createPool,
  ensureSemanticEventsTable,
  insertSemanticEvent
};
