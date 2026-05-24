# Phase 4 Implementation Report

## A. Phase 4 Overview

Phase 4 adds the IEEE 2030.5 Translator Foundation.

Phase 1 created the ingestion, Kafka, engine, and TimescaleDB base. Phase 2 added deterministic SAREF4ENER-style semantic enrichment. Phase 3 added optional SLM-assisted mapping for unknown readings. Phase 4 starts after that semantic layer and translates enriched semantic events into simple IEEE 2030.5-style payloads.

What Phase 4 added:

- a new `ieee20305-translator` Node.js service
- a Kafka consumer for `semantic.enriched`
- a Kafka producer for `ieee20305.translated`
- a new TimescaleDB hypertable called `ieee20305_events`
- a mock DSO endpoint at `POST /dso/grid-signal`
- a `grid.signals` Kafka topic for validated DSO signals
- a grid signal schema and example payload
- tests for telemetry translation and DSO signal validation

Why IEEE 2030.5 translation is needed:

SAREF4ENER gives the pipeline semantic meaning. IEEE 2030.5 is useful for grid-facing energy flexibility workflows. This phase creates a bridge between the semantic data layer and later grid service or aggregator phases.

How it extends Phase 3:

Phase 3 publishes enriched semantic readings to Kafka topic `semantic.enriched`. Phase 4 consumes that topic and creates IEEE 2030.5-style translated events without changing Phase 1, Phase 2, or Phase 3.

This phase is only a foundation. It does not claim full IEEE 2030.5 certification. It creates simple, readable payloads that resemble the kind of resources a later IEEE 2030.5 implementation may use.

## B. Architecture

Telemetry translation flow:

```text
semantic.enriched
  -> ieee20305-translator
  -> ieee20305_events
  -> ieee20305.translated
```

Step by step:

1. The semantic connector publishes enriched events to `semantic.enriched`.
2. The IEEE 2030.5 translator consumes `semantic.enriched`.
3. It chooses a simple resource type such as `MirrorMeterReading`, `DERStatus`, or `DERControlCandidate`.
4. It builds an explainable IEEE 2030.5-style payload.
5. It writes the translated event to `ieee20305_events`.
6. It publishes the translated event to `ieee20305.translated`.

Mock DSO grid signal flow:

```text
POST /dso/grid-signal
  -> validate DSO signal
  -> GridSignal payload
  -> grid.signals
  -> ieee20305_events
```

Step by step:

1. A DSO posts a grid signal to the translator service.
2. The endpoint validates required fields and allowed values.
3. The translator builds a simple `GridSignal` style payload.
4. It stores the event in `ieee20305_events`.
5. It publishes the event to Kafka topic `grid.signals`.

No household commands are sent in Phase 4.

## C. What Was Implemented

### Translator Service

The new service lives in:

```text
services/ieee20305-translator
```

It runs as a Node.js service, matching the existing Phase 1, Phase 2, and Phase 3 services.

It exposes:

- `GET /health`
- `POST /dso/grid-signal`

It consumes:

- `semantic.enriched`

It publishes:

- `ieee20305.translated`
- `grid.signals`

### Translator Module

The translator module maps enriched semantic readings to simple resource types:

- `MirrorMeterReading` for meter-style telemetry
- `DERStatus` for PV, battery, EV, or distributed energy resource state
- `DERControlCandidate` for grid-relevant semantic signals that may later inform aggregator decisions
- `GridSignal` for mock DSO grid stress or curtailment-style input

### DSO Grid Signal Endpoint

The endpoint is:

```text
POST /dso/grid-signal
```

It accepts JSON, validates it, translates it into a `GridSignal` style payload, stores it, and publishes it.

It returns:

- HTTP `202` for accepted signals
- HTTP `400` for invalid signals

### Grid Signal Schema

The schema requires:

- `signal_id`
- `dso_id`
- `community_id`
- `signal_type`
- `severity`
- `requested_action`
- `start_time`
- `end_time`
- `reason`

Allowed `signal_type` values:

- `grid_stress`
- `curtailment_request`
- `flexibility_request`

Allowed `requested_action` values:

- `reduce_load`
- `shift_load`
- `increase_export`
- `reduce_export`

### TimescaleDB Table

The new table is:

```text
ieee20305_events
```

It stores translated telemetry and DSO grid signal events.

Important fields include:

- `event_time`
- `processed_at`
- `source_topic`
- `output_topic`
- `household_id`
- `community_id`
- `device_id`
- `device_type`
- `reading_name`
- `resource_type`
- `ieee20305_payload`
- `translation_status`
- `translation_confidence`
- `explanation`
- `correlation_id`
- `raw_semantic_payload`

### Kafka Topics

Phase 4 adds:

- `ieee20305.translated`
- `grid.signals`

It also consumes the existing:

- `semantic.enriched`

### Docker Compose Changes

`docker-compose.yml` adds:

```text
ieee20305-translator
```

The service depends on:

- Kafka
- TimescaleDB

It exposes:

```text
3002:3002
```

### Tests

Tests cover:

- semantic enriched event validation
- `active_power_kw` to `MirrorMeterReading`
- battery state of charge to `DERStatus`
- invalid semantic event fallback
- valid DSO grid signal validation
- invalid DSO grid signal errors
- DSO grid signal to `GridSignal`
- endpoint `202` for valid grid signals
- endpoint `400` for invalid grid signals

## D. File-By-File Explanation

### `services/ieee20305-translator/src/index.js`

Starts the HTTP API and Kafka consumer.

It defines:

- `GET /health`
- `POST /dso/grid-signal`

It creates the Kafka producer, Kafka consumer, and TimescaleDB pool.

### `services/ieee20305-translator/src/translator.js`

Contains the pure translation logic.

It validates semantic events and grid signals, selects the IEEE 2030.5-style resource type, builds href-style identifiers, and creates explainable payloads.

### `services/ieee20305-translator/src/db.js`

Connects to TimescaleDB.

It creates `ieee20305_events` on startup if needed and inserts translated events.

### `services/ieee20305-translator/src/kafka.js`

Contains Kafka helper logic.

It consumes `semantic.enriched`, translates messages safely, stores them, and publishes translated events to `ieee20305.translated`.

It also publishes DSO grid signals to `grid.signals`.

### `schemas/grid-signal.schema.json`

Documents the mock DSO grid signal payload contract.

### `examples/dso_grid_signal.json`

Provides a valid DSO curtailment request example.

### `database/timescale/003_ieee20305_events.sql`

Creates the `ieee20305_events` table, converts it to a hypertable, and adds useful indexes.

### `docker-compose.yml`

Adds the `ieee20305-translator` service, port, Kafka topics, and TimescaleDB environment variables.

### `.env.example`

Adds:

```text
IEEE20305_TRANSLATED_TOPIC=ieee20305.translated
GRID_SIGNALS_TOPIC=grid.signals
IEEE20305_TRANSLATOR_PORT=3002
```

### `readme.md`

Adds Phase 4 run and verification instructions.

### Tests

Tests live under:

```text
services/ieee20305-translator/test
```

They do not require live Kafka or live TimescaleDB.

## E. Step-By-Step Run Guide

Run all commands from:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

Create `.env` if needed:

```powershell
Copy-Item .env.example .env
```

Start Docker Desktop.

Start the required services:

```powershell
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector ieee20305-translator
```

Send normal telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Verify `semantic.enriched`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic semantic.enriched `
  --from-beginning `
  --max-messages 1
```

Verify `ieee20305.translated`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic ieee20305.translated `
  --from-beginning `
  --max-messages 1
```

Verify `ieee20305_events`:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, resource_type, reading_name, translation_status FROM ieee20305_events ORDER BY processed_at DESC LIMIT 10;"
```

Send DSO grid signal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/dso_grid_signal.json"
```

Verify `grid.signals`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic grid.signals `
  --from-beginning `
  --max-messages 1
```

Verify database row:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, resource_type, community_id, reading_name, translation_status FROM ieee20305_events WHERE resource_type = 'GridSignal' ORDER BY processed_at DESC LIMIT 5;"
```

## F. Testing Guide

Run compose validation:

```powershell
docker compose config
```

Run Node tests:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js services/ieee20305-translator/test/*.test.js
```

Test telemetry translation:

1. Start the services.
2. Send `examples/household_telemetry.json`.
3. Check `ieee20305.translated`.
4. Query `ieee20305_events`.

Test DSO grid signal translation:

1. Send `examples/dso_grid_signal.json` to `POST /dso/grid-signal`.
2. Confirm HTTP `202`.
3. Check `grid.signals`.
4. Query `ieee20305_events` for `resource_type = 'GridSignal'`.

Test invalid DSO signal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"signal_id":"bad"}'
```

Expected result:

- HTTP `400`
- `error` set to `invalid_grid_signal`
- validation details in the response

Check logs:

```powershell
docker compose logs ieee20305-translator --tail 100
```

Check TimescaleDB:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT processed_at, resource_type, translation_status, explanation FROM ieee20305_events ORDER BY processed_at DESC LIMIT 10;"
```

## G. Example Walkthrough

### `active_power_kw`

1. A household sends telemetry containing `active_power_kw`.
2. The ingestion API publishes it to `raw.telemetry`.
3. The engine writes raw and normalized rows, then publishes `normalized.telemetry`.
4. The semantic connector maps `active_power_kw` deterministically to a SAREF4ENER power measurement.
5. The semantic connector publishes the event to `semantic.enriched`.
6. The IEEE 2030.5 translator reads the semantic event.
7. It creates a `MirrorMeterReading` style payload.
8. It stores the translated event in `ieee20305_events`.
9. It publishes the translated event to `ieee20305.translated`.

### `curtailment_request`

1. A DSO sends `examples/dso_grid_signal.json` to `POST /dso/grid-signal`.
2. The endpoint validates the signal.
3. The translator creates a `GridSignal` style payload.
4. It stores the event in `ieee20305_events`.
5. It publishes the event to `grid.signals`.
6. No household command is sent.

## H. Limitations

Phase 4 is intentionally limited:

- It is not a full certified IEEE 2030.5 stack.
- It does not implement production mTLS.
- It does not implement aggregator dispatch.
- It does not execute household commands.
- It does not implement ENERSHARE export.
- Security is still local and basic.
- The payloads are simplified, explainable foundation payloads for later phases.

## I. Next Phase Recommendation

Phase 5 should add the Aggregator and dispatch command path.

Recommended Phase 5 direction:

```text
grid.signals / ieee20305.translated
  -> aggregator
  -> dispatch candidate selection
  -> safe household command proposal path
```

Phase 5 should still avoid direct uncontrolled household command execution until policy, safety, authentication, and audit controls are in place.
