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
    manufacturer TEXT,
    measurement_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    online BOOLEAN NOT NULL DEFAULT true,
    current_operating_state TEXT,
    last_seen TIMESTAMPTZ,
    current_primary_measurement JSONB,
    cumulative_energy_kwh DOUBLE PRECISION,
    reporting_offset_ms INTEGER,
    time_zone TEXT,
    occupancy_pattern TEXT,
    base_load_profile TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    ADD COLUMN IF NOT EXISTS base_load_profile TEXT;

CREATE INDEX IF NOT EXISTS simulated_device_registry_profile_category_idx
    ON simulated_device_registry (household_profile, device_category, household_id);

CREATE INDEX IF NOT EXISTS simulated_device_registry_last_seen_idx
    ON simulated_device_registry (last_seen DESC);
