CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS security_gateway_audit (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    correlation_id TEXT,
    client_ip TEXT,
    method TEXT,
    route TEXT,
    decision TEXT NOT NULL,
    reason TEXT,
    status_code INTEGER,
    target_service TEXT,
    request_hash TEXT,
    user_agent TEXT,
    api_key_id TEXT,
    auth_mode TEXT,
    audit_payload JSONB,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable(
    'security_gateway_audit',
    'event_time',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS security_gateway_audit_created_at_idx
    ON security_gateway_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS security_gateway_audit_decision_time_idx
    ON security_gateway_audit (decision, event_time DESC);

CREATE INDEX IF NOT EXISTS security_gateway_audit_correlation_id_idx
    ON security_gateway_audit (correlation_id);
