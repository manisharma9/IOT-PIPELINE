CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS raw_telemetry (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    household_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    protocol TEXT NOT NULL,
    source TEXT NOT NULL,
    payload JSONB NOT NULL,
    kafka_topic TEXT,
    kafka_partition INTEGER,
    kafka_offset BIGINT,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('raw_telemetry', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS raw_telemetry_household_time_idx
    ON raw_telemetry (household_id, event_time DESC);

CREATE INDEX IF NOT EXISTS raw_telemetry_community_time_idx
    ON raw_telemetry (community_id, event_time DESC);

CREATE TABLE IF NOT EXISTS normalized_telemetry (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    reading_id TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    household_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    reading_name TEXT NOT NULL,
    reading_value DOUBLE PRECISION NOT NULL,
    reading_unit TEXT,
    protocol TEXT NOT NULL,
    source TEXT NOT NULL,
    normalized_payload JSONB NOT NULL,
    kafka_topic TEXT,
    kafka_partition INTEGER,
    kafka_offset BIGINT,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('normalized_telemetry', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS normalized_telemetry_device_time_idx
    ON normalized_telemetry (device_id, event_time DESC);

CREATE INDEX IF NOT EXISTS normalized_telemetry_reading_time_idx
    ON normalized_telemetry (reading_name, event_time DESC);

CREATE UNIQUE INDEX IF NOT EXISTS normalized_telemetry_reading_id_time_uidx
    ON normalized_telemetry (event_time, reading_id)
    WHERE reading_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS processing_errors (
    id BIGSERIAL NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    service_name TEXT NOT NULL DEFAULT 'engine',
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    payload JSONB,
    raw_message TEXT,
    kafka_topic TEXT,
    kafka_partition INTEGER,
    kafka_offset BIGINT,
    PRIMARY KEY (occurred_at, id)
);

SELECT create_hypertable('processing_errors', 'occurred_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS processing_errors_time_idx
    ON processing_errors (occurred_at DESC);
