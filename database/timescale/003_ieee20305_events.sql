CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS ieee20305_events (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    reading_id TEXT,
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
);

SELECT create_hypertable('ieee20305_events', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ieee20305_events_device_time_idx
    ON ieee20305_events (device_id, event_time DESC);

CREATE INDEX IF NOT EXISTS ieee20305_events_community_time_idx
    ON ieee20305_events (community_id, event_time DESC);

CREATE INDEX IF NOT EXISTS ieee20305_events_resource_time_idx
    ON ieee20305_events (resource_type, event_time DESC);

CREATE INDEX IF NOT EXISTS ieee20305_events_status_time_idx
    ON ieee20305_events (translation_status, event_time DESC);

CREATE INDEX IF NOT EXISTS ieee20305_events_correlation_id_idx
    ON ieee20305_events (correlation_id);

CREATE UNIQUE INDEX IF NOT EXISTS ieee20305_events_reading_id_time_uidx
    ON ieee20305_events (event_time, reading_id)
    WHERE reading_id IS NOT NULL;
