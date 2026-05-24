# Phase 5 Implementation Report: Aggregator and Dispatch Command Proposals

## A. Phase 5 Overview

Phase 5 adds an Aggregator service to the existing pipeline.

The Aggregator listens for grid signals created by the Phase 4 IEEE 2030.5 translator foundation and turns those grid signals into safe dispatch command proposals.

This phase is proposal-only. It does not send commands to households, does not execute control actions, and does not approve anything automatically.

The reason for adding the Aggregator is to create the first decision layer in the system. Earlier phases collect telemetry, normalize it, enrich it semantically, and translate it into IEEE 2030.5-style payloads. Phase 5 uses the DSO grid signal path to create a clear proposal such as:

- reduce EV charging
- delay flexible load
- increase PV export if available
- reduce export limit

The Aggregator extends Phase 4 by consuming the `grid.signals` topic that Phase 4 already publishes.

Phase 5 is intentionally not a command execution phase. It only creates proposed command records that can be reviewed in a later phase.

## B. Architecture

Main Phase 5 flow:

```text
grid.signals
        |
        v
aggregator
        |
        +--> dispatch_commands
        |
        +--> dispatch.command.proposed
        |
        v
dispatch.command.audit
```

Optional context flow:

```text
ieee20305.translated
        |
        v
aggregator context
```

In this foundation, the Aggregator is configured with the `ieee20305.translated` topic name so it can be used as context later. The proposal-creation path is driven by `grid.signals`.

The important behavior is:

1. The Phase 4 translator receives a DSO grid signal through `POST /dso/grid-signal`.
2. The translator validates it and publishes a `GridSignal` message to `grid.signals`.
3. The Aggregator consumes `grid.signals`.
4. The Aggregator validates the GridSignal event.
5. The Aggregator creates a proposal-only dispatch command.
6. The proposal is stored in the `dispatch_commands` TimescaleDB hypertable.
7. The proposal is published to `dispatch.command.proposed`.
8. An audit record is published to `dispatch.command.audit`.
9. No command is executed.

## C. What Was Implemented

### Aggregator service

The new `services/aggregator` service is a Node.js service, matching the existing Phase 1 to Phase 4 service style.

It provides:

- Kafka consumption from `grid.signals`
- proposal creation
- TimescaleDB insertion
- Kafka publishing to `dispatch.command.proposed`
- Kafka publishing to `dispatch.command.audit`
- HTTP health and read endpoints

### Dispatch proposal logic

The Aggregator uses simple rule-based logic.

Supported requested actions:

- `reduce_load`
- `shift_load`
- `increase_export`
- `reduce_export`

Proposal actions:

- `reduce_ev_charging`
- `delay_flexible_load`
- `increase_pv_export_if_available`
- `reduce_export_limit`

Severity to target kW mapping:

- `low` = 1.0 kW
- `medium` = 2.5 kW
- `high` = 5.0 kW
- `critical` = 7.5 kW

If severity is unknown, the Aggregator safely falls back to `medium`.

### Validation

The Aggregator validates incoming grid signal events before creating a proposal.

Required GridSignal fields:

- `signal_id`
- `community_id`
- `requested_action`
- `severity`
- `start_time`
- `end_time`

Invalid events do not create dispatch proposals. They can publish a failed audit record, and the service keeps running.

### Dispatch commands table

The new `dispatch_commands` TimescaleDB hypertable stores proposal-only records. The default status is `proposed`.

No executed command records are created in this phase.

### Kafka topics

Phase 5 adds:

- `dispatch.command.proposed`
- `dispatch.command.audit`

### HTTP read endpoints

The Aggregator exposes:

- `GET /health`
- `GET /dispatch/proposals`
- `GET /dispatch/proposals/:id`

There is no execute endpoint.

### Tests

Unit tests were added for proposal logic, validation behavior, Kafka message processing, audit payloads, and HTTP read endpoints.

Tests do not require live Kafka or live TimescaleDB.

## D. File-By-File Explanation

### `services/aggregator/src/index.js`

Starts the Aggregator HTTP API and Kafka consumer.

Endpoints:

- `GET /health`
- `GET /dispatch/proposals`
- `GET /dispatch/proposals/:id`

The health endpoint states that command execution is disabled.

### `services/aggregator/src/aggregator.js`

Contains the pure proposal logic.

It maps DSO requested actions to safe proposal actions, calculates target kW from severity, creates the proposal payload, and creates the audit payload.

### `services/aggregator/src/validation.js`

Validates incoming GridSignal messages.

It supports the Phase 4 `GridSignal` event format and a direct grid signal object shape. It rejects malformed or unsupported events before proposal creation.

### `services/aggregator/src/db.js`

Connects to TimescaleDB and provides helpers to:

- create/ensure the `dispatch_commands` table
- insert dispatch command proposals
- query recent proposals
- query one proposal by id

Database failures are caught by safe helper functions where needed, so the service can log errors without crashing the pipeline.

### `services/aggregator/src/kafka.js`

Connects to Kafka and provides helpers to:

- consume `grid.signals`
- publish `dispatch.command.proposed`
- publish `dispatch.command.audit`
- process invalid messages safely

### `database/timescale/004_dispatch_commands.sql`

Adds the `dispatch_commands` hypertable.

Important fields include:

- `event_time`
- `created_at`
- `source_topic`
- `output_topic`
- `signal_id`
- `dso_id`
- `community_id`
- `proposal_type`
- `requested_action`
- `proposed_action`
- `target_kw`
- `status`
- `decision_payload`
- `source_grid_signal`
- `source_ieee20305_payload`
- `audit_payload`
- `correlation_id`

The default status is `proposed`.

### `examples/dispatch_proposal_example.json`

Shows an example proposal record. It includes `no_execution: true` to make the proposal-only behavior clear.

### `docker-compose.yml`

Adds the `aggregator` service.

It depends on:

- `kafka`
- `timescaledb`

It exposes:

- `3003:3003`

### `.env.example`

Adds:

```text
DISPATCH_PROPOSED_TOPIC=dispatch.command.proposed
DISPATCH_AUDIT_TOPIC=dispatch.command.audit
AGGREGATOR_PORT=3003
```

### `README.md`

Adds a Phase 5 section explaining the Aggregator, dispatch proposals, Kafka topics, API endpoints, and run/test commands.

### Tests

Tests are in:

- `services/aggregator/test/aggregator.test.js`
- `services/aggregator/test/index.test.js`

They cover:

- valid grid signal proposal creation
- action mapping
- severity target kW mapping
- invalid grid signal rejection
- audit payload creation
- HTTP health endpoint
- proposal listing endpoint

## E. Step-By-Step Run Guide

Open PowerShell and go to the repository folder:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Start Docker Desktop.

Start the required services:

```powershell
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector ieee20305-translator aggregator
```

Send normal telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Send a DSO grid signal:

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

Verify Aggregator logs:

```powershell
docker compose logs aggregator --tail 100
```

Verify `dispatch.command.proposed`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.proposed `
  --from-beginning `
  --max-messages 1
```

Verify `dispatch.command.audit`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.audit `
  --from-beginning `
  --max-messages 1
```

Verify `dispatch_commands` rows:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT id, community_id, requested_action, proposed_action, target_kw, status, created_at FROM dispatch_commands ORDER BY created_at DESC LIMIT 10;"
```

Call the Aggregator read endpoint:

```powershell
Invoke-RestMethod -Uri "http://localhost:3003/dispatch/proposals" -Method Get
```

## F. Testing Guide

Run Docker Compose config validation:

```powershell
docker compose config
```

Run Aggregator unit tests:

```powershell
node --test services/aggregator/test/*.test.js
```

Run all Node service tests:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js services/ieee20305-translator/test/*.test.js services/aggregator/test/*.test.js
```

Test a valid grid signal by sending:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/dso_grid_signal.json"
```

Test an invalid DSO signal by sending a JSON body with a bad `requested_action`, such as `disconnect_households`. The Phase 4 endpoint should return HTTP 400, and the Aggregator should not create a proposal.

Check Kafka topics:

```powershell
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --list
```

Check database rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT status, requested_action, proposed_action, target_kw FROM dispatch_commands ORDER BY created_at DESC LIMIT 10;"
```

Check logs:

```powershell
docker compose logs aggregator --tail 100
```

Check HTTP endpoint:

```powershell
Invoke-RestMethod -Uri "http://localhost:3003/health" -Method Get
Invoke-RestMethod -Uri "http://localhost:3003/dispatch/proposals" -Method Get
```

## G. Example Walkthrough

### Curtailment request with `requested_action = reduce_load`

1. A DSO sends a grid signal to the Phase 4 endpoint.
2. The request says the community should reduce load.
3. The Phase 4 translator validates the signal.
4. The translator creates a `GridSignal` style payload.
5. The translator publishes that payload to `grid.signals`.
6. The Aggregator consumes `grid.signals`.
7. The Aggregator validates the GridSignal event.
8. The Aggregator sees `requested_action = reduce_load`.
9. The Aggregator creates a proposal with `proposed_action = reduce_ev_charging`.
10. If severity is `medium`, the target is `2.5` kW.
11. The proposal is stored in `dispatch_commands` with `status = proposed`.
12. The proposal is published to `dispatch.command.proposed`.
13. An audit record is published to `dispatch.command.audit`.
14. No command is executed.

Example DSO signal:

```json
{
  "signal_id": "signal-001",
  "dso_id": "dso-dublin",
  "community_id": "community-dublin-north",
  "signal_type": "curtailment_request",
  "severity": "medium",
  "requested_action": "reduce_load",
  "start_time": "2026-05-24T18:00:00Z",
  "end_time": "2026-05-24T19:00:00Z",
  "reason": "Local transformer load is approaching threshold"
}
```

Resulting proposal:

```json
{
  "requested_action": "reduce_load",
  "proposed_action": "reduce_ev_charging",
  "target_kw": 2.5,
  "status": "proposed",
  "no_execution": true
}
```

## H. Limitations

Phase 5 does not include:

- real household control
- automatic command execution
- approval workflow
- production security hardening
- ENERSHARE export
- real device availability optimization
- full production mTLS

The Aggregator uses simple rule-based proposal logic only.

It does not check actual household asset availability yet. For example, it does not know whether a specific household has an EV charger available at the requested time.

## I. Next Phase Recommendation

Phase 6 should add an approval workflow and safe command dispatch preparation.

Recommended Phase 6 status path:

```text
proposed -> reviewed -> approved -> ready_to_dispatch
```

Phase 6 should still avoid direct uncontrolled execution. It should prepare the approval and readiness model before any later command dispatch phase.
