CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS dispatch_execution_audit (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatch_command_id BIGINT,
    proposal_id TEXT,
    community_id TEXT,
    household_id TEXT,
    device_id TEXT,
    requested_action TEXT,
    proposed_action TEXT,
    mock_device_type TEXT NOT NULL,
    mock_command_payload JSONB NOT NULL,
    mock_result_payload JSONB NOT NULL,
    simulation_status TEXT NOT NULL,
    simulation_message TEXT NOT NULL,
    no_real_execution BOOLEAN NOT NULL DEFAULT TRUE,
    execution_mode TEXT NOT NULL DEFAULT 'mock',
    source_ready_event JSONB,
    audit_payload JSONB NOT NULL,
    correlation_id TEXT,
    PRIMARY KEY (event_time, id),
    CONSTRAINT dispatch_execution_audit_no_real_execution_chk CHECK (no_real_execution = TRUE),
    CONSTRAINT dispatch_execution_audit_execution_mode_chk CHECK (execution_mode = 'mock')
);

SELECT create_hypertable('dispatch_execution_audit', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS dispatch_execution_audit_created_at_idx
    ON dispatch_execution_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS dispatch_execution_audit_command_time_idx
    ON dispatch_execution_audit (dispatch_command_id, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_execution_audit_status_time_idx
    ON dispatch_execution_audit (simulation_status, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_execution_audit_correlation_id_idx
    ON dispatch_execution_audit (correlation_id);
