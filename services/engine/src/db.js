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

async function ensureEngineScalabilitySchema(pool) {
  await pool.query("ALTER TABLE normalized_telemetry ADD COLUMN IF NOT EXISTS reading_id TEXT");
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS normalized_telemetry_reading_id_time_uidx
      ON normalized_telemetry (event_time, reading_id)
      WHERE reading_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS raw_telemetry_kafka_identity_time_uidx
      ON raw_telemetry (event_time, kafka_topic, kafka_partition, kafka_offset)
      WHERE kafka_offset IS NOT NULL
  `);
}

async function insertTelemetryBatch(pool, normalizedTelemetry, kafkaMetadata) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const raw = normalizedTelemetry.rawRow;
    await client.query(
      `
        INSERT INTO raw_telemetry (
          event_time,
          household_id,
          community_id,
          device_id,
          device_type,
          protocol,
          source,
          payload,
          kafka_topic,
          kafka_partition,
          kafka_offset
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
        ON CONFLICT (event_time, kafka_topic, kafka_partition, kafka_offset)
          WHERE kafka_offset IS NOT NULL DO NOTHING
      `,
      [
        raw.event_time,
        raw.household_id,
        raw.community_id,
        raw.device_id,
        raw.device_type,
        raw.protocol,
        raw.source,
        JSON.stringify(raw.payload),
        kafkaMetadata.topic,
        kafkaMetadata.partition,
        kafkaMetadata.offset
      ]
    );

    for (const row of normalizedTelemetry.normalizedRows) {
      await client.query(
        `
          INSERT INTO normalized_telemetry (
            event_time,
            reading_id,
            household_id,
            community_id,
            device_id,
            device_type,
            reading_name,
            reading_value,
            reading_unit,
            protocol,
            source,
            normalized_payload,
            kafka_topic,
            kafka_partition,
            kafka_offset
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15)
          ON CONFLICT (event_time, reading_id) WHERE reading_id IS NOT NULL DO NOTHING
        `,
        [
          row.event_time,
          row.reading_id,
          row.household_id,
          row.community_id,
          row.device_id,
          row.device_type,
          row.reading_name,
          row.reading_value,
          row.reading_unit,
          row.protocol,
          row.source,
          JSON.stringify(row.normalized_payload),
          kafkaMetadata.topic,
          kafkaMetadata.partition,
          kafkaMetadata.offset
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertProcessingError(pool, errorRecord) {
  await pool.query(
    `
      INSERT INTO processing_errors (
        service_name,
        error_type,
        error_message,
        payload,
        raw_message,
        kafka_topic,
        kafka_partition,
        kafka_offset
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
    `,
    [
      errorRecord.service_name || "engine",
      errorRecord.error_type || "ProcessingError",
      errorRecord.error_message || "Unknown processing error.",
      errorRecord.payload ? JSON.stringify(errorRecord.payload) : null,
      errorRecord.raw_message || null,
      errorRecord.kafka_topic || null,
      errorRecord.kafka_partition ?? null,
      errorRecord.kafka_offset ?? null
    ]
  );
}

module.exports = {
  createPool,
  ensureEngineScalabilitySchema,
  insertProcessingError,
  insertTelemetryBatch
};
