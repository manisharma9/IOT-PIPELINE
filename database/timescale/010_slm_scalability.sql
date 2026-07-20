CREATE EXTENSION IF NOT EXISTS timescaledb;

ALTER TABLE normalized_telemetry
    ADD COLUMN IF NOT EXISTS reading_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS raw_telemetry_kafka_identity_time_uidx
    ON raw_telemetry (event_time, kafka_topic, kafka_partition, kafka_offset)
    WHERE kafka_offset IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS normalized_telemetry_reading_id_time_uidx
    ON normalized_telemetry (event_time, reading_id)
    WHERE reading_id IS NOT NULL;

ALTER TABLE semantic_events
    ADD COLUMN IF NOT EXISTS reading_id TEXT,
    ADD COLUMN IF NOT EXISTS slm_called BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS slm_provider TEXT,
    ADD COLUMN IF NOT EXISTS slm_model TEXT,
    ADD COLUMN IF NOT EXISTS slm_confidence DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS final_status TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS safely_unmapped BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS semantic_events_reading_id_time_uidx
    ON semantic_events (event_time, reading_id)
    WHERE reading_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS semantic_slm_audit (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    reading_id TEXT NOT NULL,
    household_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    reading_name TEXT NOT NULL,
    slm_called BOOLEAN NOT NULL,
    slm_provider TEXT NOT NULL,
    slm_model TEXT NOT NULL,
    slm_worker_id TEXT NOT NULL,
    slm_batch_id TEXT NOT NULL,
    slm_request_id TEXT,
    slm_attempt_count INTEGER NOT NULL,
    slm_inference_started_at TIMESTAMPTZ,
    slm_inference_completed_at TIMESTAMPTZ,
    slm_inference_latency_ms DOUBLE PRECISION,
    slm_output_received BOOLEAN NOT NULL,
    slm_mapping JSONB,
    slm_confidence DOUBLE PRECISION,
    deterministic_validation JSONB NOT NULL,
    validation_failure_reason TEXT,
    final_status TEXT NOT NULL,
    safely_unmapped BOOLEAN NOT NULL,
    inference_server_identity TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    audit_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('semantic_slm_audit', 'event_time', if_not_exists => TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS semantic_slm_audit_reading_id_time_uidx
    ON semantic_slm_audit (event_time, reading_id);

CREATE INDEX IF NOT EXISTS semantic_slm_audit_batch_time_idx
    ON semantic_slm_audit (slm_batch_id, event_time DESC);

CREATE INDEX IF NOT EXISTS semantic_slm_audit_status_time_idx
    ON semantic_slm_audit (final_status, event_time DESC);

CREATE TABLE IF NOT EXISTS semantic_batch_metrics (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    slm_batch_id TEXT NOT NULL,
    slm_worker_id TEXT NOT NULL,
    slm_provider TEXT NOT NULL,
    slm_model TEXT NOT NULL,
    inference_server_identity TEXT,
    input_readings INTEGER NOT NULL,
    mapped_readings INTEGER NOT NULL,
    safely_unmapped_readings INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL,
    queue_time_ms DOUBLE PRECISION,
    inference_latency_ms DOUBLE PRECISION,
    database_latency_ms DOUBLE PRECISION,
    total_latency_ms DOUBLE PRECISION,
    status TEXT NOT NULL,
    metrics_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('semantic_batch_metrics', 'event_time', if_not_exists => TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS semantic_batch_metrics_batch_time_uidx
    ON semantic_batch_metrics (event_time, slm_batch_id);

ALTER TABLE ieee20305_events
    ADD COLUMN IF NOT EXISTS reading_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ieee20305_events_reading_id_time_uidx
    ON ieee20305_events (event_time, reading_id)
    WHERE reading_id IS NOT NULL;
