# Phase 2 Implementation Report

## A. Phase 2 Overview

Phase 2 adds the SAREF4ENER semantic connector foundation.

Phase 1 already accepted telemetry through HTTP and MQTT, published raw events to Kafka, normalized the readings, and wrote raw and normalized rows into TimescaleDB. Phase 2 extends that foundation by adding a semantic enrichment step after normalization.

What Phase 2 implemented:

- The engine now publishes every normalized reading to Kafka topic `normalized.telemetry`.
- A new `semantic-connector` service consumes `normalized.telemetry`.
- The semantic connector maps known energy readings to deterministic SAREF4ENER-style fields.
- The semantic connector writes enriched events into a new TimescaleDB hypertable called `semantic_events`.
- The semantic connector publishes enriched events to Kafka topic `semantic.enriched`.
- Unknown readings are handled safely as `unmapped` instead of crashing.

Why this phase was needed:

The target architecture needs a semantic layer between normalized telemetry and future data sharing or grid services. Phase 2 creates that layer without adding model dependency or SLM complexity yet. This makes the pipeline easier to test, explain, and extend.

How it extends Phase 1:

Phase 1 ends at normalized telemetry. Phase 2 starts from normalized telemetry and adds deterministic semantic meaning. The old MySQL, Ditto, Orion-LD, Streamlit, and Vercel files are not removed or replaced.

## B. Architecture

The Phase 2 flow is:

```text
normalized.telemetry
  -> semantic-connector
  -> semantic_events
  -> semantic.enriched
```

Step by step:

1. The Phase 1 engine consumes `raw.telemetry`.
2. The engine validates and normalizes the telemetry.
3. The engine still writes rows to `raw_telemetry` and `normalized_telemetry`.
4. The engine now also publishes each normalized reading to `normalized.telemetry`.
5. The `semantic-connector` consumes `normalized.telemetry`.
6. The connector maps each reading to deterministic SAREF4ENER-style fields.
7. The connector writes the enriched semantic event to `semantic_events`.
8. The connector publishes the enriched event to `semantic.enriched`.

## C. Services Added Or Updated

### Engine Update

Location: `services/engine`

The engine still does its Phase 1 job: consume raw telemetry, validate it, normalize it, and write TimescaleDB rows.

Phase 2 adds one new behavior: after successful normalization and database insert, the engine publishes each normalized row to Kafka topic `normalized.telemetry`.

Each normalized Kafka event includes:

- `event_time`
- `household_id`
- `community_id`
- `device_id`
- `device_type`
- `reading_name`
- `reading_value`
- `reading_unit`
- `protocol`
- `source`
- `correlation_id`

The `correlation_id` is based on the raw Kafka topic, partition, and offset. This helps trace a semantic event back to the raw message path.

### Semantic Connector Service

Location: `services/semantic-connector`

This is the new Phase 2 service. It:

- consumes `normalized.telemetry`
- validates the normalized event shape
- finds a deterministic mapping for the reading name
- builds a readable semantic JSON payload
- writes the event to TimescaleDB table `semantic_events`
- publishes the enriched event to `semantic.enriched`

The service is intentionally deterministic. It does not call Ollama, Phi-3, or any SLM in Phase 2.

### Semantic Mapping File

Location: `services/semantic-connector/src/saref4ener-mapping.js`

This file contains deterministic mappings for energy-relevant readings, including:

- `active_power_kw`
- `voltage_v`
- `current_a`
- `energy_kwh`
- `energy_import_kwh`
- `frequency_hz`
- `power_factor`
- `pv_generation_kw`
- `ev_charging_power_kw`
- `battery_soc_percent`

Each mapping defines:

- `saref_type`
- `saref_property`
- `saref_unit`
- `saref4ener_concept`
- `ngsi_type`
- `ngsi_property`
- `explanation`

### Semantic Payload Builder

Location: `services/semantic-connector/src/semantic-builder.js`

This file builds the structured semantic JSON payload.

The payload includes:

- `context`
- `entity_id`
- `entity_type`
- `observed_at`
- `device`
- `household`
- `community`
- `measurement`
- `saref`
- `saref4ener`
- `ngsi`
- `explanation`

### TimescaleDB semantic_events Table

Location: `database/timescale/002_semantic_events.sql`

This migration creates the new table:

```text
semantic_events
```

It is converted into a TimescaleDB hypertable using `event_time`.

The semantic connector also creates the table on startup if it does not exist. This is helpful when a local Docker volume was already initialized during Phase 1, because Docker entrypoint migrations only run automatically on a fresh database volume.

### Kafka Topics

Phase 2 uses these topics:

- `raw.telemetry` from Phase 1
- `normalized.telemetry` added in Phase 2
- `semantic.enriched` added in Phase 2

The topic names are documented in `.env.example`.

## D. Step-by-Step Run Guide

Run all commands from:

```powershell
C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

Create a local `.env` file if you do not already have one:

```powershell
Copy-Item .env.example .env
```

Start Phase 1 and Phase 2 services:

```powershell
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector
```

Check containers:

```powershell
docker compose ps
```

Send sample telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Expected API response:

```json
{
  "status": "accepted",
  "topic": "raw.telemetry"
}
```

Check `raw.telemetry`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic raw.telemetry `
  --from-beginning `
  --max-messages 1
```

Check `normalized.telemetry`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic normalized.telemetry `
  --from-beginning `
  --max-messages 1
```

Check `semantic.enriched`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic semantic.enriched `
  --from-beginning `
  --max-messages 1
```

Check normalized rows in TimescaleDB:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, device_id, reading_name, reading_value, reading_unit FROM normalized_telemetry ORDER BY processed_at DESC LIMIT 10;"
```

Check semantic rows in TimescaleDB:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, device_id, reading_name, saref4ener_concept, mapping_source, mapping_confidence FROM semantic_events ORDER BY processed_at DESC LIMIT 10;"
```

Check semantic connector logs:

```powershell
docker compose logs semantic-connector --tail 100
```

Check engine logs:

```powershell
docker compose logs engine --tail 100
```

## E. Example Mapping Explanation

Example:

```text
active_power_kw -> SAREF4ENER semantic event
```

A normalized event may contain:

```json
{
  "reading_name": "active_power_kw",
  "reading_value": 1.42,
  "reading_unit": "kW"
}
```

The deterministic mapping treats this as an instantaneous electrical power measurement.

It enriches the event with:

- `saref_type`: `saref:Measurement`
- `saref_property`: `saref:Power`
- `saref_unit`: `unit:KiloW`
- `saref4ener_concept`: `saref4ener:PowerMeasurement`
- `ngsi_type`: `Property`
- `ngsi_property`: `activePower`
- `mapping_source`: `deterministic`
- `mapping_confidence`: `high`

This does not mean the system has completed full standards certification. It means the pipeline now has a clear, consistent semantic foundation that can later be strengthened with fuller ontology handling.

## F. Unknown Field Fallback

If the semantic connector receives a reading name that is not in the mapping file, it does not crash.

Instead, it creates an unmapped semantic event with:

- `mapping_source`: `unmapped`
- `mapping_confidence`: `low`
- `saref_property`: `unmapped`
- a clear explanation saying there is no deterministic mapping yet

The event is still:

- stored in `semantic_events`
- published to `semantic.enriched`

This is important because unknown telemetry should be visible for review. In Phase 3, the fallback path can be extended to ask an SLM for a suggested mapping.

## G. Limitations of Phase 2

Phase 2 does not implement:

- real SLM or Ollama integration
- Phi-3 Mini mapping
- IEEE 2030.5 translator
- aggregator dispatch commands
- ENERSHARE export
- full production security layer

Security is still basic and local. The current focus is the semantic connector foundation.

## H. Next Phase Recommendation

Phase 3 should add SLM-assisted mapping for unknown readings.

Recommended direction:

```text
unknown normalized reading
  -> deterministic mapping lookup fails
  -> SLM-assisted suggestion using Phi-3 Mini / Ollama
  -> reviewed semantic mapping proposal
  -> semantic.enriched event with explainable mapping metadata
```

The deterministic mapping file should remain the safe default path. The SLM should only help with unknown readings, and the system should keep storing explanations and confidence values so the result is auditable.

## Testing Steps

Run local Node tests:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js
```

Test a valid payload:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

A successful API result returns HTTP `202` and `status: accepted`.

Test an invalid payload:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"household_id":""}'
```

An invalid API result returns HTTP `400` with `error: invalid_telemetry`.

Test unknown mapping fallback:

```powershell
$unknownPayload = @{
  household_id = "household-unknown"
  community_id = "community-dublin-north"
  device_id = "meter-unknown"
  device_type = "smart_meter"
  timestamp = "2026-05-24T18:00:00Z"
  readings = @{
    mystery_grid_signal = @{
      value = 7.5
      unit = "custom"
    }
  }
  protocol = "http"
  source = "manual-test"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -Body $unknownPayload
```

Then check:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT reading_name, mapping_source, mapping_confidence, explanation FROM semantic_events WHERE reading_name = 'mystery_grid_signal' ORDER BY processed_at DESC LIMIT 5;"
```

Successful fallback output should show `mapping_source` as `unmapped` and `mapping_confidence` as `low`.
