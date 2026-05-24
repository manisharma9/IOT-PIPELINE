CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS device_command_audit (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    command_id TEXT,
    proposal_id TEXT,
    device_id TEXT,
    device_type TEXT,
    provider TEXT,
    community_id TEXT,
    area_id TEXT,
    requested_reduction_kw DOUBLE PRECISION,
    allocated_reduction_kw DOUBLE PRECISION,
    action TEXT,
    translated_command JSONB,
    simulated_response JSONB,
    execution_mode TEXT NOT NULL DEFAULT 'simulated_device_api',
    no_real_execution BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL,
    correlation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_time, id),
    CONSTRAINT device_command_audit_no_real_execution_chk CHECK (no_real_execution = TRUE)
);

SELECT create_hypertable('device_command_audit', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS device_command_audit_created_at_idx
    ON device_command_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS device_command_audit_device_time_idx
    ON device_command_audit (device_id, event_time DESC);

CREATE INDEX IF NOT EXISTS device_command_audit_status_time_idx
    ON device_command_audit (status, event_time DESC);

CREATE INDEX IF NOT EXISTS device_command_audit_correlation_id_idx
    ON device_command_audit (correlation_id);
