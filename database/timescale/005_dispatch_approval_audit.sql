CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS dispatch_approval_audit (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatch_command_id BIGINT NOT NULL,
    proposal_id TEXT,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    action TEXT NOT NULL,
    reviewer_id TEXT NOT NULL,
    reviewer_role TEXT NOT NULL,
    comment TEXT,
    approval_payload JSONB NOT NULL,
    source_dispatch_command JSONB,
    audit_payload JSONB NOT NULL,
    correlation_id TEXT,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('dispatch_approval_audit', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS dispatch_approval_audit_command_time_idx
    ON dispatch_approval_audit (dispatch_command_id, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_approval_audit_status_time_idx
    ON dispatch_approval_audit (new_status, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_approval_audit_correlation_id_idx
    ON dispatch_approval_audit (correlation_id);
