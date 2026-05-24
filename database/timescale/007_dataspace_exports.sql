CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS dataspace_exports (
    id BIGSERIAL NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    export_type TEXT NOT NULL,
    requester_id TEXT,
    requester_role TEXT,
    community_id TEXT,
    asset_id TEXT,
    record_count INTEGER NOT NULL DEFAULT 0,
    access_policy TEXT NOT NULL,
    minimization_applied BOOLEAN NOT NULL DEFAULT TRUE,
    pseudonymization_applied BOOLEAN NOT NULL DEFAULT TRUE,
    export_status TEXT NOT NULL,
    export_payload JSONB NOT NULL,
    audit_payload JSONB NOT NULL,
    correlation_id TEXT,
    PRIMARY KEY (event_time, id)
);

SELECT create_hypertable('dataspace_exports', 'event_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS dataspace_exports_created_at_idx
    ON dataspace_exports (created_at DESC);

CREATE INDEX IF NOT EXISTS dataspace_exports_type_time_idx
    ON dataspace_exports (export_type, event_time DESC);

CREATE INDEX IF NOT EXISTS dataspace_exports_community_time_idx
    ON dataspace_exports (community_id, event_time DESC);

CREATE INDEX IF NOT EXISTS dataspace_exports_status_time_idx
    ON dataspace_exports (export_status, event_time DESC);

CREATE INDEX IF NOT EXISTS dataspace_exports_correlation_id_idx
    ON dataspace_exports (correlation_id);
