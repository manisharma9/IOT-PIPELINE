CREATE TABLE IF NOT EXISTS simulated_device_registry (
    device_id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    area_id TEXT,
    household_profile TEXT NOT NULL
        CHECK (household_profile IN ('apartment', 'standard_home', 'prosumer_home')),
    device_category TEXT NOT NULL,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    flexibility_capable BOOLEAN NOT NULL DEFAULT false,
    maximum_flexible_power_kw DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (maximum_flexible_power_kw >= 0),
    simulated BOOLEAN NOT NULL DEFAULT true CHECK (simulated = true),
    no_real_execution BOOLEAN NOT NULL DEFAULT true CHECK (no_real_execution = true),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS simulated_device_registry_household_category_idx
    ON simulated_device_registry (household_id, device_category, device_id);

CREATE INDEX IF NOT EXISTS simulated_device_registry_community_household_idx
    ON simulated_device_registry (community_id, household_id);

CREATE INDEX IF NOT EXISTS normalized_telemetry_device_time_idx
    ON normalized_telemetry (household_id, device_id, event_time DESC);

CREATE OR REPLACE VIEW customer_device_latest_state AS
WITH latest_readings AS (
    SELECT DISTINCT ON (household_id, device_id, reading_name)
        household_id,
        community_id,
        device_id,
        device_type,
        reading_name,
        reading_value,
        reading_unit,
        event_time,
        processed_at
    FROM normalized_telemetry
    ORDER BY household_id, device_id, reading_name, event_time DESC, processed_at DESC
)
SELECT
    household_id,
    max(community_id) AS community_id,
    device_id,
    max(device_type) AS device_type,
    max(event_time) AS last_seen,
    max(
        CASE
            WHEN reading_name IN (
                'active_power_kw',
                'ev_charging_power_kw',
                'heat_pump_power_kw',
                'power_kw',
                'pv_generation_kw',
                'battery_power_kw'
            ) THEN reading_value
            WHEN reading_name IN ('power_w', 'active_power_w') THEN reading_value / 1000.0
        END
    ) AS current_power_kw,
    max(reading_value) FILTER (
        WHERE reading_name IN (
            'energy_import_kwh',
            'energy_delivered_kwh',
            'energy_kwh',
            'energy_export_kwh',
            'energy_throughput_kwh'
        )
    ) AS cumulative_energy_kwh,
    max(reading_value) FILTER (WHERE reading_name = 'voltage_v') AS voltage_v,
    max(reading_value) FILTER (WHERE reading_name = 'current_a') AS current_a,
    max(reading_value) FILTER (WHERE reading_name = 'indoor_temperature_c') AS indoor_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'target_temperature_c') AS target_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'flow_temperature_c') AS flow_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'charging_state_code') AS charging_state_code,
    max(reading_value) FILTER (WHERE reading_name = 'operating_mode_code') AS operating_mode_code,
    max(reading_value) FILTER (WHERE reading_name = 'operating_state_code') AS operating_state_code,
    max(reading_value) FILTER (WHERE reading_name = 'water_temperature_c') AS water_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'battery_soc_percent') AS battery_soc_percent,
    max(reading_value) FILTER (WHERE reading_name = 'pv_generation_kw') AS pv_generation_kw,
    max(reading_value) FILTER (WHERE reading_name = 'battery_power_kw') AS battery_power_kw
FROM latest_readings
GROUP BY household_id, device_id;

CREATE OR REPLACE VIEW customer_household_power_15m AS
WITH per_device_bucket AS (
    SELECT
        time_bucket(INTERVAL '15 minutes', event_time) AS bucket_start,
        household_id,
        community_id,
        device_id,
        device_type,
        avg(
            CASE
                WHEN reading_name = 'pv_generation_kw' THEN -reading_value
                WHEN lower(coalesce(reading_unit, '')) IN ('w', 'watt', 'watts')
                    THEN reading_value / 1000.0
                ELSE reading_value
            END
        ) AS average_power_kw,
        count(*) AS sample_count
    FROM normalized_telemetry
    WHERE reading_name IN (
        'active_power_kw',
        'ev_charging_power_kw',
        'heat_pump_power_kw',
        'power_kw',
        'power_w',
        'active_power_w',
        'pv_generation_kw',
        'battery_power_kw'
    )
    GROUP BY
        time_bucket(INTERVAL '15 minutes', event_time),
        household_id,
        community_id,
        device_id,
        device_type
)
SELECT
    bucket_start,
    household_id,
    community_id,
    coalesce(sum(average_power_kw) FILTER (WHERE device_type <> 'smart_meter'), 0)
        AS total_power_kw,
    sum(average_power_kw) FILTER (
        WHERE device_type IN ('shelly_plug', 'smart_plug', 'plug')
    ) AS smart_plug_power_kw,
    sum(average_power_kw) FILTER (
        WHERE device_type IN ('ev_charger', 'easee_core', 'charger')
    ) AS ev_charger_power_kw,
    sum(average_power_kw) FILTER (
        WHERE device_type IN ('heat_pump', 'hvac')
    ) AS heat_pump_power_kw,
    sum(sample_count) AS sample_count
FROM per_device_bucket
GROUP BY bucket_start, household_id, community_id;

CREATE OR REPLACE VIEW customer_household_daily_energy AS
WITH annotated AS (
    SELECT
        energy.*,
        coalesce(registry.device_category, energy.device_type) AS category
    FROM customer_device_daily_energy energy
    LEFT JOIN simulated_device_registry registry
      ON registry.device_id = energy.device_id
     AND registry.household_id = energy.household_id
)
SELECT
    day_start,
    household_id,
    community_id,
    sum(energy_used_kwh) FILTER (WHERE category <> 'smart_meter') AS energy_used_kwh,
    sum(meter_delta_kwh) FILTER (WHERE category <> 'smart_meter') AS metered_energy_kwh,
    sum(estimated_energy_kwh) FILTER (WHERE category <> 'smart_meter') AS estimated_energy_kwh,
    count(*) FILTER (
        WHERE data_quality = 'measured' AND category <> 'smart_meter'
    ) AS measured_device_count,
    count(*) FILTER (
        WHERE data_quality = 'estimated' AND category <> 'smart_meter'
    ) AS estimated_device_count,
    CASE
        WHEN count(*) FILTER (
            WHERE data_quality = 'estimated' AND category <> 'smart_meter'
        ) > 0
         AND count(*) FILTER (
            WHERE data_quality = 'measured' AND category <> 'smart_meter'
        ) > 0 THEN 'partly_estimated'
        WHEN count(*) FILTER (
            WHERE data_quality = 'measured' AND category <> 'smart_meter'
        ) > 0 THEN 'measured'
        WHEN count(*) FILTER (
            WHERE data_quality = 'estimated' AND category <> 'smart_meter'
        ) > 0 THEN 'estimated'
        ELSE 'unavailable'
    END AS data_quality
FROM annotated
GROUP BY day_start, household_id, community_id;
