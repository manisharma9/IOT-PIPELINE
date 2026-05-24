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

async function ensureIeee20305EventsTable(pool) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ieee20305_events (
      id BIGSERIAL NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source_topic TEXT NOT NULL,
      output_topic TEXT NOT NULL,
      household_id TEXT,
      community_id TEXT,
      device_id TEXT,
      device_type TEXT,
      reading_name TEXT,
      resource_type TEXT NOT NULL,
      ieee20305_payload JSONB NOT NULL,
      translation_status TEXT NOT NULL,
      translation_confidence TEXT NOT NULL,
      explanation TEXT NOT NULL,
      correlation_id TEXT,
      raw_semantic_payload JSONB,
      PRIMARY KEY (event_time, id)
    )
  `);
  await pool.query(
    "SELECT create_hypertable('ieee20305_events', 'event_time', if_not_exists => TRUE)"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ieee20305_events_device_time_idx
      ON ieee20305_events (device_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ieee20305_events_community_time_idx
      ON ieee20305_events (community_id, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ieee20305_events_resource_time_idx
      ON ieee20305_events (resource_type, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ieee20305_events_status_time_idx
      ON ieee20305_events (translation_status, event_time DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ieee20305_events_correlation_id_idx
      ON ieee20305_events (correlation_id)
  `);
}

async function insertIeee20305Event(pool, event) {
  await pool.query(
    `
      INSERT INTO ieee20305_events (
        event_time,
        processed_at,
        source_topic,
        output_topic,
        household_id,
        community_id,
        device_id,
        device_type,
        reading_name,
        resource_type,
        ieee20305_payload,
        translation_status,
        translation_confidence,
        explanation,
        correlation_id,
        raw_semantic_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11::jsonb, $12, $13, $14, $15, $16::jsonb
      )
    `,
    [
      event.event_time,
      event.processed_at,
      event.source_topic,
      event.output_topic,
      event.household_id,
      event.community_id,
      event.device_id,
      event.device_type,
      event.reading_name,
      event.resource_type,
      JSON.stringify(event.ieee20305_payload),
      event.translation_status,
      event.translation_confidence,
      event.explanation,
      event.correlation_id,
      event.raw_semantic_payload ? JSON.stringify(event.raw_semantic_payload) : null
    ]
  );
}

async function safeInsertIeee20305Event(pool, event) {
  try {
    await insertIeee20305Event(pool, event);
    return true;
  } catch (error) {
    console.error("Could not store IEEE 2030.5 event:", error);
    return false;
  }
}

module.exports = {
  createPool,
  ensureIeee20305EventsTable,
  insertIeee20305Event,
  safeInsertIeee20305Event
};
