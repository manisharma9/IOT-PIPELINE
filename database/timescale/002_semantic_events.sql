CREATE EXTENSION IF NOT EXISTS timescaledb;

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
);

SELECT create_hypertable('semantic_events', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS semantic_events_device_time_idx
    ON semantic_events (device_id, event_time DESC);

CREATE INDEX IF NOT EXISTS semantic_events_reading_time_idx
    ON semantic_events (reading_name, event_time DESC);

CREATE INDEX IF NOT EXISTS semantic_events_mapping_source_time_idx
    ON semantic_events (mapping_source, event_time DESC);

CREATE INDEX IF NOT EXISTS semantic_events_correlation_id_idx
    ON semantic_events (correlation_id);
