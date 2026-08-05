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
  await pool.query("ALTER TABLE raw_telemetry ADD COLUMN IF NOT EXISTS message_id TEXT");
  await pool.query("ALTER TABLE normalized_telemetry ADD COLUMN IF NOT EXISTS reading_id TEXT");
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS raw_telemetry_message_id_time_uidx
      ON raw_telemetry (event_time, message_id)
      WHERE message_id IS NOT NULL
  `);
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
  await pool.query(`
    ALTER TABLE simulated_device_registry
      ADD COLUMN IF NOT EXISTS manufacturer TEXT,
      ADD COLUMN IF NOT EXISTS measurement_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS current_operating_state TEXT,
      ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS current_primary_measurement JSONB,
      ADD COLUMN IF NOT EXISTS cumulative_energy_kwh DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS reporting_offset_ms INTEGER,
      ADD COLUMN IF NOT EXISTS time_zone TEXT,
      ADD COLUMN IF NOT EXISTS occupancy_pattern TEXT,
      ADD COLUMN IF NOT EXISTS base_load_profile TEXT
  `);
}

async function upsertSimulatedDevice(client, raw) {
  const metadata = raw.payload?.metadata;
  if (!metadata || metadata.simulated !== true || !metadata.household_profile) return;

  await client.query(
    `
      INSERT INTO simulated_device_registry (
        device_id, household_id, community_id, area_id, household_profile,
        device_category, display_name, provider, manufacturer,
        flexibility_capable, maximum_flexible_power_kw, measurement_capabilities,
        online, current_operating_state, last_seen, current_primary_measurement,
        cumulative_energy_kwh, reporting_offset_ms, time_zone, occupancy_pattern,
        base_load_profile, simulated, no_real_execution, updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,
        $16::jsonb,$17,$18,$19,$20,$21,true,true,now()
      )
      ON CONFLICT (device_id) DO UPDATE SET
        household_id = EXCLUDED.household_id,
        community_id = EXCLUDED.community_id,
        area_id = EXCLUDED.area_id,
        household_profile = EXCLUDED.household_profile,
        device_category = EXCLUDED.device_category,
        display_name = EXCLUDED.display_name,
        provider = EXCLUDED.provider,
        manufacturer = EXCLUDED.manufacturer,
        flexibility_capable = EXCLUDED.flexibility_capable,
        maximum_flexible_power_kw = EXCLUDED.maximum_flexible_power_kw,
        measurement_capabilities = EXCLUDED.measurement_capabilities,
        online = EXCLUDED.online,
        current_operating_state = EXCLUDED.current_operating_state,
        last_seen = EXCLUDED.last_seen,
        current_primary_measurement = EXCLUDED.current_primary_measurement,
        cumulative_energy_kwh = EXCLUDED.cumulative_energy_kwh,
        reporting_offset_ms = EXCLUDED.reporting_offset_ms,
        time_zone = EXCLUDED.time_zone,
        occupancy_pattern = EXCLUDED.occupancy_pattern,
        base_load_profile = EXCLUDED.base_load_profile,
        simulated = true,
        no_real_execution = true,
        updated_at = now()
    `,
    [
      raw.device_id,
      raw.household_id,
      raw.community_id,
      metadata.area_id || null,
      metadata.household_profile,
      metadata.device_category || raw.device_type,
      metadata.display_name || raw.device_type,
      metadata.manufacturer || "simulated",
      metadata.manufacturer || "simulated",
      Boolean(metadata.flexibility_capable),
      Number(metadata.maximum_flexible_power_kw || 0),
      JSON.stringify(metadata.measurement_capabilities || []),
      metadata.online !== false,
      metadata.operating_state || "available",
      raw.event_time,
      metadata.current_primary_measurement
        ? JSON.stringify(metadata.current_primary_measurement)
        : null,
      metadata.cumulative_energy_kwh ?? null,
      metadata.reporting_offset_ms ?? null,
      metadata.time_zone || null,
      metadata.occupancy_pattern || null,
      metadata.base_load_profile || null
    ]
  );
}

async function insertTelemetryBatch(pool, normalizedTelemetry, kafkaMetadata) {
  const client = await pool.connect();
  const insertedReadingIds = new Set();

  try {
    await client.query("BEGIN");

    const raw = normalizedTelemetry.rawRow;
    await upsertSimulatedDevice(client, raw);
    await client.query(
      `
        INSERT INTO raw_telemetry (
          event_time,
          message_id,
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
        ON CONFLICT DO NOTHING
      `,
      [
        raw.event_time,
        raw.message_id,
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
      const inserted = await client.query(
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
          RETURNING reading_id
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
      if (inserted.rowCount === 1) {
        insertedReadingIds.add(row.reading_id);
      }
    }

    await client.query("COMMIT");
    return {
      insertedNormalizedRows: normalizedTelemetry.normalizedRows.filter(
        (row) => insertedReadingIds.has(row.reading_id)
      )
    };
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
  insertTelemetryBatch,
  upsertSimulatedDevice
};
