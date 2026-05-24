CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS dispatch_commands (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_topic TEXT NOT NULL,
    output_topic TEXT NOT NULL,
    signal_id TEXT,
    dso_id TEXT,
    community_id TEXT NOT NULL,
    household_id TEXT,
    device_id TEXT,
    proposal_type TEXT NOT NULL,
    requested_action TEXT NOT NULL,
    proposed_action TEXT NOT NULL,
    target_kw DOUBLE PRECISION,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    reason TEXT NOT NULL,
    decision_payload JSONB NOT NULL,
    source_grid_signal JSONB,
    source_ieee20305_payload JSONB,
    audit_payload JSONB NOT NULL,
    correlation_id TEXT,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('dispatch_commands', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS dispatch_commands_created_at_idx
    ON dispatch_commands (created_at DESC);

CREATE INDEX IF NOT EXISTS dispatch_commands_community_time_idx
    ON dispatch_commands (community_id, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_commands_status_time_idx
    ON dispatch_commands (status, event_time DESC);

CREATE INDEX IF NOT EXISTS dispatch_commands_signal_id_idx
    ON dispatch_commands (signal_id);

CREATE INDEX IF NOT EXISTS dispatch_commands_correlation_id_idx
    ON dispatch_commands (correlation_id);
