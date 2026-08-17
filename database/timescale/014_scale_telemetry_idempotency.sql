ALTER TABLE raw_telemetry
    ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS raw_telemetry_message_id_time_uidx
    ON raw_telemetry (event_time, message_id)
    WHERE message_id IS NOT NULL;

COMMENT ON COLUMN raw_telemetry.message_id IS
    'Optional producer-assigned idempotency identifier. Scale generators reuse it on bounded transport retries.';
