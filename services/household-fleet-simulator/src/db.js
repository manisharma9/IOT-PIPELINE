"use strict";

const { Pool } = require("pg");

function createPool(env = process.env) {
  return new Pool({
    host: env.TIMESCALE_HOST || "timescaledb",
    port: Number(env.TIMESCALE_PORT || 5432),
    database: env.TIMESCALE_DB || "energy_flex",
    user: env.TIMESCALE_USER || "energy_user",
    password: env.TIMESCALE_PASSWORD || "energy_password",
    max: Number(env.TIMESCALE_POOL_SIZE || 4)
  });
}

async function ensureRegistry(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS simulated_device_registry (
      device_id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      community_id TEXT NOT NULL,
      area_id TEXT,
      household_profile TEXT NOT NULL,
      device_category TEXT NOT NULL,
      display_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      flexibility_capable BOOLEAN NOT NULL DEFAULT false,
      maximum_flexible_power_kw DOUBLE PRECISION NOT NULL DEFAULT 0,
      simulated BOOLEAN NOT NULL DEFAULT true CHECK (simulated = true),
      no_real_execution BOOLEAN NOT NULL DEFAULT true CHECK (no_real_execution = true),
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS simulated_device_registry_household_category_idx
    ON simulated_device_registry (household_id, device_category, device_id)
  `);
}

async function registerFleet(pool, inventories) {
  await ensureRegistry(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of inventories) {
      await client.query(
        `
          INSERT INTO simulated_device_registry (
            device_id, household_id, community_id, area_id, household_profile,
            device_category, display_name, provider, flexibility_capable,
            maximum_flexible_power_kw, simulated, no_real_execution, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,true,now())
          ON CONFLICT (device_id) DO UPDATE SET
            household_id = EXCLUDED.household_id,
            community_id = EXCLUDED.community_id,
            area_id = EXCLUDED.area_id,
            household_profile = EXCLUDED.household_profile,
            device_category = EXCLUDED.device_category,
            display_name = EXCLUDED.display_name,
            provider = EXCLUDED.provider,
            flexibility_capable = EXCLUDED.flexibility_capable,
            maximum_flexible_power_kw = EXCLUDED.maximum_flexible_power_kw,
            simulated = true,
            no_real_execution = true,
            updated_at = now()
        `,
        [
          item.device_id,
          item.household_id,
          item.community_id,
          item.area_id,
          item.household_profile,
          item.device_category,
          item.display_name,
          item.provider,
          item.flexibility_capable,
          item.maximum_flexible_power_kw
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

module.exports = {
  createPool,
  ensureRegistry,
  registerFleet
};

