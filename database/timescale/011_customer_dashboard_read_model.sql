CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE INDEX IF NOT EXISTS normalized_telemetry_household_reading_time_idx
    ON normalized_telemetry (household_id, reading_name, event_time DESC);

CREATE INDEX IF NOT EXISTS normalized_telemetry_community_time_idx
    ON normalized_telemetry (community_id, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_commands_household_time_idx
    ON dispatch_commands (household_id, event_time DESC);

CREATE INDEX IF NOT EXISTS device_command_audit_proposal_time_idx
    ON device_command_audit (proposal_id, event_time DESC);

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
        'active_power_w'
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
    sum(average_power_kw) AS total_power_kw,
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
                'power_kw'
            ) THEN reading_value
            WHEN reading_name IN ('power_w', 'active_power_w') THEN reading_value / 1000.0
        END
    ) AS current_power_kw,
    max(reading_value) FILTER (
        WHERE reading_name IN ('energy_import_kwh', 'energy_delivered_kwh', 'energy_kwh')
    ) AS cumulative_energy_kwh,
    max(reading_value) FILTER (WHERE reading_name = 'voltage_v') AS voltage_v,
    max(reading_value) FILTER (WHERE reading_name = 'current_a') AS current_a,
    max(reading_value) FILTER (WHERE reading_name = 'indoor_temperature_c') AS indoor_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'target_temperature_c') AS target_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'flow_temperature_c') AS flow_temperature_c,
    max(reading_value) FILTER (WHERE reading_name = 'charging_state_code') AS charging_state_code,
    max(reading_value) FILTER (WHERE reading_name = 'operating_mode_code') AS operating_mode_code
FROM latest_readings
GROUP BY household_id, device_id;

CREATE OR REPLACE VIEW customer_device_daily_energy AS
WITH daily_meter AS (
    SELECT
        time_bucket(INTERVAL '1 day', event_time) AS day_start,
        household_id,
        community_id,
        device_id,
        max(device_type) AS device_type,
        GREATEST(max(reading_value) - min(reading_value), 0) AS meter_delta_kwh,
        count(*) AS meter_sample_count
    FROM normalized_telemetry
    WHERE reading_name IN ('energy_import_kwh', 'energy_delivered_kwh', 'energy_kwh')
    GROUP BY
        time_bucket(INTERVAL '1 day', event_time),
        household_id,
        community_id,
        device_id
),
power_buckets AS (
    SELECT
        time_bucket(INTERVAL '1 day', bucket_start) AS day_start,
        household_id,
        community_id,
        device_id,
        max(device_type) AS device_type,
        sum(average_power_kw * 0.25) AS estimated_energy_kwh,
        sum(sample_count) AS power_sample_count
    FROM (
        SELECT
            time_bucket(INTERVAL '15 minutes', event_time) AS bucket_start,
            household_id,
            community_id,
            device_id,
            device_type,
            avg(
                CASE
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
            'active_power_w'
        )
        GROUP BY
            time_bucket(INTERVAL '15 minutes', event_time),
            household_id,
            community_id,
            device_id,
            device_type
    ) samples
    GROUP BY
        time_bucket(INTERVAL '1 day', bucket_start),
        household_id,
        community_id,
        device_id
),
keys AS (
    SELECT day_start, household_id, community_id, device_id FROM daily_meter
    UNION
    SELECT day_start, household_id, community_id, device_id FROM power_buckets
)
SELECT
    keys.day_start,
    keys.household_id,
    keys.community_id,
    keys.device_id,
    coalesce(daily_meter.device_type, power_buckets.device_type) AS device_type,
    CASE
        WHEN coalesce(daily_meter.meter_sample_count, 0) >= 2
            THEN daily_meter.meter_delta_kwh
        ELSE power_buckets.estimated_energy_kwh
    END AS energy_used_kwh,
    daily_meter.meter_delta_kwh,
    power_buckets.estimated_energy_kwh,
    coalesce(daily_meter.meter_sample_count, 0) AS meter_sample_count,
    coalesce(power_buckets.power_sample_count, 0) AS power_sample_count,
    CASE
        WHEN coalesce(daily_meter.meter_sample_count, 0) >= 2 THEN 'measured'
        WHEN coalesce(power_buckets.power_sample_count, 0) > 0 THEN 'estimated'
        ELSE 'unavailable'
    END AS data_quality
FROM keys
LEFT JOIN daily_meter USING (day_start, household_id, community_id, device_id)
LEFT JOIN power_buckets USING (day_start, household_id, community_id, device_id);

CREATE OR REPLACE VIEW customer_household_daily_energy AS
SELECT
    day_start,
    household_id,
    community_id,
    sum(energy_used_kwh) AS energy_used_kwh,
    sum(meter_delta_kwh) AS metered_energy_kwh,
    sum(estimated_energy_kwh) AS estimated_energy_kwh,
    count(*) FILTER (WHERE data_quality = 'measured') AS measured_device_count,
    count(*) FILTER (WHERE data_quality = 'estimated') AS estimated_device_count,
    CASE
        WHEN count(*) FILTER (WHERE data_quality = 'estimated') > 0
             AND count(*) FILTER (WHERE data_quality = 'measured') > 0
            THEN 'partly_estimated'
        WHEN count(*) FILTER (WHERE data_quality = 'measured') > 0
            THEN 'measured'
        WHEN count(*) FILTER (WHERE data_quality = 'estimated') > 0
            THEN 'estimated'
        ELSE 'unavailable'
    END AS data_quality
FROM customer_device_daily_energy
GROUP BY day_start, household_id, community_id;

CREATE TABLE IF NOT EXISTS household_generated_insights (
    insight_id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    insight_category TEXT NOT NULL,
    insight_text TEXT NOT NULL,
    supporting_metric_references JSONB NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_timestamp TIMESTAMPTZ NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    validation_status TEXT NOT NULL,
    model_identifier TEXT,
    generation_trigger TEXT NOT NULL DEFAULT 'hourly_cache',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS household_generated_insights_household_expiry_idx
    ON household_generated_insights (household_id, expiry_timestamp DESC);

CREATE INDEX IF NOT EXISTS household_generated_insights_community_time_idx
    ON household_generated_insights (community_id, generated_at DESC);
