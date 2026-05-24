# Phase 1 Implementation Report

## 1. Phase 1 Overview

Phase 1 added a new production-style foundation beside the old Smart Home IoT pipeline. The old MySQL, Eclipse Ditto, Orion-LD, Streamlit, and Vercel dashboard files were left in place.

What Phase 1 implemented:

- A new Express ingestion API that accepts household energy telemetry over HTTP.
- A Mosquitto MQTT broker for MQTT telemetry.
- A small MQTT subscriber that reads `telemetry/#` messages and republishes valid telemetry to Kafka.
- Apache Kafka with a `raw.telemetry` topic for message routing.
- PostgreSQL with TimescaleDB for time-series storage.
- A small engine service that consumes Kafka messages, validates them, normalizes readings, and writes TimescaleDB rows.
- A shared telemetry JSON schema.
- A sample household telemetry payload.
- Basic validation and normalization tests.

Why this phase was needed:

The old project was a useful manual smart-home semantic pipeline, but it wrote simulated data straight into MySQL and then processed it with a Python loop. Paolo's target architecture needs a more production-style foundation where telemetry enters through HTTP or MQTT, moves through Kafka, and lands in a time-series database before later semantic enrichment.

How this supports Paolo's target architecture:

This phase creates the lower part of the new architecture:

- households and communities can send telemetry through HTTP or MQTT
- Kafka becomes the routing layer
- the engine becomes the deserialization, validation, normalization, and storage component
- TimescaleDB becomes the time-series store

It prepares the project for the later SLM Semantic Connector, SAREF4ENER enrichment, IEEE 2030.5 translator, aggregator, and ENERSHARE export.

## 2. Architecture Added in Phase 1

The new Phase 1 flow is:

```text
HTTP telemetry / MQTT telemetry
        |
        v
Kafka raw.telemetry topic
        |
        v
Engine service
        |
        v
TimescaleDB raw_telemetry and normalized_telemetry tables
```

In simple terms:

1. A household sends a telemetry payload.
2. The payload reaches either the Express API or the MQTT broker.
3. Valid telemetry is published to Kafka topic `raw.telemetry`.
4. The engine consumes messages from `raw.telemetry`.
5. The engine stores the original event in `raw_telemetry`.
6. The engine expands each reading into normalized rows in `normalized_telemetry`.
7. Invalid messages are stored in `processing_errors`.

## 3. Services Added

### ingestion-api

Location: `services/ingestion-api`

What it does:

The ingestion API is a small Express service. It exposes `POST /telemetry`. It accepts JSON telemetry payloads, validates the required fields, and publishes valid messages to Kafka topic `raw.telemetry`.

Why it is needed:

The target architecture needs an HTTP entry point for households, communities, gateways, or simulators. This service is that first HTTP entry point.

How it connects:

- receives HTTP JSON telemetry
- validates the payload shape
- publishes valid messages to Kafka
- returns `400` for invalid payloads
- returns `202` when the telemetry is accepted

### MQTT broker

Location: `services/mqtt-broker/mosquitto.conf`

What it does:

The MQTT broker is a Mosquitto service. It listens on port `1883` and accepts MQTT telemetry messages.

Why it is needed:

Many IoT devices and gateways use MQTT instead of HTTP. The target architecture explicitly includes MQTT telemetry.

How it connects:

- receives MQTT messages on topics such as `telemetry/household-001/meter-001`
- makes those messages available to the MQTT subscriber

### Kafka

Compose services: `zookeeper` and `kafka`

What it does:

Kafka routes messages between ingestion services and processing services. In Phase 1, the important topic is `raw.telemetry`.

Why it is needed:

Kafka decouples incoming telemetry from downstream processing. The ingestion API can accept telemetry quickly, and the engine can process the stream independently.

How it connects:

- receives messages from `ingestion-api`
- receives messages from `mqtt-subscriber`
- provides messages to `engine`

### TimescaleDB

Compose service: `timescaledb`

What it does:

TimescaleDB stores telemetry as time-series data. The migration creates three hypertables:

- `raw_telemetry`
- `normalized_telemetry`
- `processing_errors`

Why it is needed:

Energy flexibility telemetry is time-based. TimescaleDB is designed for efficient time-series storage and querying.

How it connects:

- the engine writes raw events to `raw_telemetry`
- the engine writes normalized readings to `normalized_telemetry`
- the engine writes invalid messages or processing failures to `processing_errors`

### engine

Location: `services/engine`

What it does:

The engine consumes Kafka messages from `raw.telemetry`. It parses JSON, validates the payload, normalizes readings, and writes to TimescaleDB.

Why it is needed:

The target architecture needs a service that deserializes, normalizes, and validates data before semantic enrichment.

How it connects:

- consumes from Kafka topic `raw.telemetry`
- writes original events into `raw_telemetry`
- writes normalized per-reading rows into `normalized_telemetry`
- writes invalid messages into `processing_errors`

## 4. Folder Structure

### services/ingestion-api

Contains the Express HTTP API.

Important files:

- `package.json` lists Node dependencies.
- `Dockerfile` builds the API container.
- `src/index.js` defines `GET /health` and `POST /telemetry`.
- `test/validation.test.js` checks payload validation behavior.

### services/engine

Contains the Kafka consumer and TimescaleDB writer.

Important files:

- `package.json` lists Node dependencies.
- `Dockerfile` builds the engine container.
- `src/index.js` runs the Kafka consumer.
- `src/normalizer.js` converts telemetry readings into normalized rows.
- `src/db.js` writes raw events, normalized rows, and processing errors.
- `test/normalizer.test.js` checks normalization behavior.

### services/mqtt-broker

Contains the Mosquitto broker config.

Important file:

- `mosquitto.conf` enables a simple local MQTT listener on port `1883`.

### services/mqtt-subscriber

Contains the MQTT to Kafka bridge.

Important files:

- `package.json` lists Node dependencies.
- `Dockerfile` builds the subscriber container.
- `src/index.js` subscribes to MQTT `telemetry/#` and publishes valid JSON to Kafka.
- `README.md` explains the subscriber's small Phase 1 role.

### services/common

Contains shared validation code.

Important file:

- `telemetry-validator.js` validates the required telemetry fields and reading values.

### schemas/telemetry.schema.json

Defines the shared telemetry payload contract. It documents required fields and allowed reading shapes.

### database/timescale

Contains TimescaleDB migration files.

Important file:

- `001_init.sql` creates the time-series tables and hypertables.

### examples

Contains example input data.

Important file:

- `household_telemetry.json` is a valid sample HTTP telemetry payload.

### .env.example

Contains safe local defaults for ports, Kafka topic names, MQTT settings, and TimescaleDB credentials. It does not contain real secrets.

### docker-compose changes

`docker-compose.yml` now includes new additive services:

- `zookeeper`
- `kafka`
- `mqtt-broker`
- `timescaledb`
- `ingestion-api`
- `mqtt-subscriber`
- `engine`

The existing Ditto and Orion-LD services remain in the file.

## 5. Step-by-Step Run Guide

Run these commands from the repository root:

```powershell
Copy-Item .env.example .env
```

Start only the new Phase 1 production foundation:

```powershell
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine
```

Check containers:

```powershell
docker compose ps
```

You should see containers for Kafka, Zookeeper, MQTT broker, TimescaleDB, ingestion API, MQTT subscriber, and engine.

Send sample telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Check the API response:

The successful response should include:

```json
{
  "status": "accepted",
  "topic": "raw.telemetry"
}
```

Verify Kafka received data:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic raw.telemetry `
  --from-beginning `
  --max-messages 1
```

Verify the engine processed data:

```powershell
docker compose logs engine --tail=50
```

You should see a log line saying that telemetry was processed.

Check raw rows in TimescaleDB:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, household_id, device_id, protocol FROM raw_telemetry ORDER BY received_at DESC LIMIT 5;"
```

Check normalized rows in TimescaleDB:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, device_id, reading_name, reading_value, reading_unit FROM normalized_telemetry ORDER BY processed_at DESC LIMIT 10;"
```

Check processing errors:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT occurred_at, error_type, error_message FROM processing_errors ORDER BY occurred_at DESC LIMIT 10;"
```

## 6. Example Payload Explanation

File: `examples/household_telemetry.json`

### household_id

Example: `household-001`

This identifies the household that produced the telemetry.

### community_id

Example: `community-dublin-north`

This identifies the community, neighbourhood, or flexibility group that the household belongs to.

### device_id

Example: `meter-001`

This identifies the individual device that produced the readings.

### device_type

Example: `smart_meter`

This describes the device category. Later phases can use this to choose the right semantic mapping.

### timestamp

Example: `2026-05-24T17:00:00Z`

This is the time when the measurement was produced. TimescaleDB uses this as the time-series event time.

### readings

Example:

```json
{
  "active_power_kw": {
    "value": 1.42,
    "unit": "kW"
  }
}
```

This contains one or more named measurements. A reading can include a numeric value and a unit.

### protocol

Example: `http`

This records whether telemetry arrived through HTTP or MQTT.

### source

Example: `household-gateway`

This records the source system, gateway, simulator, or connector that sent the payload.

## 7. Data Flow Explanation

When one telemetry request is sent:

1. The request enters the Express API at `POST /telemetry`.
2. The API parses the JSON body.
3. The API validates required fields such as `household_id`, `device_id`, `timestamp`, and `readings`.
4. If the payload is invalid, the API returns `400` with validation details.
5. If the payload is valid, the API publishes it to Kafka topic `raw.telemetry`.
6. The engine consumes the Kafka message.
7. The engine deserializes the Kafka message from JSON.
8. The engine validates the payload again before writing it.
9. The engine stores the full original event in `raw_telemetry`.
10. The engine splits each reading into its own normalized row in `normalized_telemetry`.
11. If the engine cannot parse or validate a message, it stores the failure in `processing_errors`.

## 8. Testing Steps

### Test a valid payload

Send:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Successful output should include:

- HTTP status `202`
- `status` set to `accepted`
- `topic` set to `raw.telemetry`

Then check TimescaleDB:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT COUNT(*) FROM raw_telemetry;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT COUNT(*) FROM normalized_telemetry;"
```

### Test an invalid payload

Send a payload with required fields missing:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"device_id":"meter-001","readings":{"active_power_kw":1.2}}'
```

Failure output should include:

- HTTP status `400`
- `error` set to `invalid_telemetry`
- a `details` array explaining missing fields

### Run local unit tests

If Node.js is available on your machine:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/normalizer.test.js
```

Successful output should show passing tests for:

- valid telemetry validation
- invalid telemetry validation
- engine normalization

## 9. Limitations of Phase 1

Phase 1 is intentionally limited. It does not implement:

- SLM Semantic Connector
- SAREF4ENER enrichment
- IEEE 2030.5 translator
- Aggregator dispatch commands
- ENERSHARE export
- full security layer for incoming telemetry

The current MQTT broker config allows anonymous local development traffic. That is acceptable for a first local foundation, but production deployment would need authentication, authorization, TLS, and network restrictions.

The ingestion API validates payload shape, but it does not yet authenticate households or communities.

The engine writes normalized rows to TimescaleDB, but it does not yet publish a `normalized.telemetry` Kafka topic.

## 10. Next Phase Recommendation

Phase 2 should build the SAREF4ENER semantic connector that consumes `normalized.telemetry` and produces `semantic.enriched` events.

Recommended Phase 2 flow:

```text
normalized telemetry
        |
        v
SLM Semantic Connector
        |
        v
SAREF4ENER enriched data
        |
        v
semantic.enriched events
```

The semantic connector should consume `normalized.telemetry`, apply SAREF4ENER concepts, and produce `semantic.enriched` events that can later feed the IEEE 2030.5 translator, aggregator, and ENERSHARE dataspace export. Phase 1 prepared the normalized data model; Phase 2 should add the normalized event stream and semantic enrichment step.
