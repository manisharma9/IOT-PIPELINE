# Phase 7 Implementation Report: Safe Mock Dispatch Adapter

## A. Phase 7 Overview

Phase 7 adds a safe mock dispatch adapter after the Phase 6 approval workflow.

Phase 6 ends when an approved proposal is marked:

```text
ready_to_dispatch
```

Phase 7 consumes those ready events and simulates command preparation. It does not control real household devices.

What was added:

- a new `mock-dispatch-adapter` Node.js service
- validation for `dispatch.command.ready` events
- simulated command mapping for proposal actions
- Kafka topic publishing for mock sent, mock result, and mock audit events
- a new `dispatch_execution_audit` TimescaleDB hypertable
- HTTP read endpoints for mock dispatch audit rows
- examples for a ready event and mock result
- tests for validation, mock command mapping, publishing behavior, audit payloads, and HTTP endpoints

Why the mock dispatch adapter is needed:

The project now has telemetry, semantic enrichment, IEEE 2030.5-style translation, aggregator proposals, and an approval workflow. A later system will need a dispatch adapter. Before building anything that could control a device, Phase 7 creates a safe mock version so the pipeline can test the shape of dispatch preparation without risk.

How it extends Phase 6:

Phase 6 publishes:

```text
dispatch.command.ready
```

Phase 7 consumes that topic and creates only simulated outputs:

```text
dispatch.command.mock.sent
dispatch.command.mock.result
dispatch.mock.audit
dispatch_execution_audit
```

Why this phase still does not control real devices:

Every mock event includes:

```json
{
  "simulated": true,
  "no_real_execution": true,
  "execution_mode": "mock",
  "safety_note": "Mock adapter only. No real household device was controlled."
}
```

There is no endpoint or code path that sends commands to a real household, EV charger, inverter, battery, or appliance.

## B. Architecture

Phase 7 flow:

```text
dispatch.command.ready
        |
        v
mock-dispatch-adapter
        |
        +--> dispatch.command.mock.sent
        |
        +--> dispatch.command.mock.result
        |
        +--> dispatch_execution_audit
        |
        v
dispatch.mock.audit
```

Step by step:

1. The approval workflow publishes a ready event to `dispatch.command.ready`.
2. The mock dispatch adapter consumes the ready event.
3. The adapter validates the event.
4. The event must have `status = ready_to_dispatch`.
5. The event must have `no_execution = true`.
6. The event must have `execution_blocked = true`.
7. The adapter maps the proposed action to a mock device command.
8. The adapter publishes the simulated command to `dispatch.command.mock.sent`.
9. The adapter creates a simulated success result.
10. The adapter publishes the result to `dispatch.command.mock.result`.
11. The adapter writes an audit row to `dispatch_execution_audit`.
12. The adapter publishes an audit event to `dispatch.mock.audit`.
13. No real device is controlled.

Invalid ready events are rejected. They do not create mock sent or mock result events.

## C. What Was Implemented

### Mock dispatch adapter service

The new service is:

```text
services/mock-dispatch-adapter
```

It uses Node.js, Express, KafkaJS, and `pg`, matching the other services.

It consumes:

- `dispatch.command.ready`

It publishes:

- `dispatch.command.mock.sent`
- `dispatch.command.mock.result`
- `dispatch.mock.audit`

It writes:

- `dispatch_execution_audit`

### Mock adapter logic

The adapter maps approved proposal actions to simulated device commands:

| Proposed action | Mock device type | Mock command |
| --- | --- | --- |
| `reduce_ev_charging` | `ev_charger` | `set_charging_limit` |
| `delay_flexible_load` | `flexible_load` | `delay_start` |
| `discharge_battery_if_available` | `battery` | `discharge_mock` |
| `reduce_battery_charging` | `battery` | `reduce_charge_rate` |
| `increase_pv_export_if_available` | `solar_inverter` | `increase_export_mock` |
| `reduce_export_limit` | `solar_inverter` | `reduce_export_limit` |

All generated command payloads are simulated.

### Validation

The adapter validates every ready event.

Required fields:

- `dispatch_command_id` or `proposal_id`
- `community_id`
- `proposed_action`
- `requested_action`
- `status = ready_to_dispatch`
- `no_execution = true`
- `execution_blocked = true`

If `no_execution` or `execution_blocked` is missing or false, the adapter rejects the event.

### Dispatch execution audit table

The new table is:

```text
dispatch_execution_audit
```

Important fields:

- `event_time`
- `created_at`
- `dispatch_command_id`
- `proposal_id`
- `community_id`
- `household_id`
- `device_id`
- `requested_action`
- `proposed_action`
- `mock_device_type`
- `mock_command_payload`
- `mock_result_payload`
- `simulation_status`
- `simulation_message`
- `no_real_execution`
- `execution_mode`
- `source_ready_event`
- `audit_payload`
- `correlation_id`

The table includes constraints to keep:

```text
no_real_execution = true
execution_mode = mock
```

### Kafka topics

Phase 7 adds:

- `dispatch.command.mock.sent`
- `dispatch.command.mock.result`
- `dispatch.mock.audit`

### HTTP read endpoints

The mock dispatch adapter exposes:

- `GET /health`
- `GET /mock-dispatch/audit`
- `GET /mock-dispatch/audit/:id`

There is no execute endpoint.

### Docker Compose changes

`docker-compose.yml` adds:

```text
mock-dispatch-adapter
```

It depends on:

- Kafka
- TimescaleDB

It exposes:

```text
3005:3005
```

### Tests

Tests cover:

- valid ready event creates a mock command
- ready event without `no_execution = true` is rejected
- ready event without `execution_blocked = true` is rejected
- action mapping for EV charger, flexible load, and battery commands
- mock sent event includes `simulated = true` and `no_real_execution = true`
- mock result event includes `execution_mode = mock`
- audit payload creation
- `GET /health`
- `GET /mock-dispatch/audit`

Tests do not require live Kafka or live TimescaleDB.

## D. File-By-File Explanation

### `services/mock-dispatch-adapter/src/index.js`

Starts the HTTP API and Kafka consumer.

Endpoints:

- `GET /health`
- `GET /mock-dispatch/audit`
- `GET /mock-dispatch/audit/:id`

The health response clearly states:

- `execution_mode = mock`
- `real_device_control = false`
- real execution is disabled

### `services/mock-dispatch-adapter/src/mock-adapter.js`

Contains the pure mock command logic.

It maps proposed actions to simulated device commands and creates:

- mock command payloads
- mock result payloads
- mock audit payloads
- rejected audit payloads for invalid ready events

### `services/mock-dispatch-adapter/src/validation.js`

Validates ready events from `dispatch.command.ready`.

It rejects unsafe events before any mock sent or mock result event is created.

### `services/mock-dispatch-adapter/src/db.js`

Connects to TimescaleDB.

It can:

- create/ensure `dispatch_execution_audit`
- insert mock dispatch audit rows
- query recent audit rows
- query one audit row by id

### `services/mock-dispatch-adapter/src/kafka.js`

Connects to Kafka.

It:

- consumes `dispatch.command.ready`
- publishes `dispatch.command.mock.sent`
- publishes `dispatch.command.mock.result`
- publishes `dispatch.mock.audit`
- handles invalid messages safely

### `database/timescale/006_dispatch_execution_audit.sql`

Creates the `dispatch_execution_audit` hypertable and indexes.

It enforces mock-only audit rows with checks for:

- `no_real_execution = true`
- `execution_mode = mock`

### `examples/mock_ready_dispatch_event.json`

Shows a safe ready event that can be consumed by the mock dispatch adapter.

### `examples/mock_dispatch_result_example.json`

Shows a simulated result event with:

- `simulated = true`
- `execution_mode = mock`
- `no_real_execution = true`

### `docker-compose.yml`

Adds the `mock-dispatch-adapter` service and its environment variables.

### `.env.example`

Adds:

```text
MOCK_DISPATCH_ADAPTER_PORT=3005
DISPATCH_MOCK_SENT_TOPIC=dispatch.command.mock.sent
DISPATCH_MOCK_RESULT_TOPIC=dispatch.command.mock.result
DISPATCH_MOCK_AUDIT_TOPIC=dispatch.mock.audit
```

### `README.md`

Adds Phase 7 architecture, topics, run commands, test commands, and safety limitations.

### Tests

Tests are in:

```text
services/mock-dispatch-adapter/test
```

## E. Step-By-Step Run Guide

Go to the repository folder:

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
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector ieee20305-translator aggregator approval-workflow mock-dispatch-adapter
```

Send a DSO grid signal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/dso_grid_signal.json"
```

Verify a dispatch proposal was created:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT id, requested_action, proposed_action, status FROM dispatch_commands ORDER BY created_at DESC LIMIT 5;"
```

Set the proposal id:

```powershell
$proposalId = 1
```

Review the proposal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/review" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_review_request.json"
```

Approve the proposal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/approve" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_approve_request.json"
```

Mark the proposal ready:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/mark-ready" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_mark_ready_request.json"
```

Verify `dispatch.command.ready`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.ready `
  --from-beginning `
  --max-messages 1
```

Verify the mock adapter consumed the ready event:

```powershell
docker compose logs mock-dispatch-adapter --tail 100
```

Verify `dispatch.command.mock.sent`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.mock.sent `
  --from-beginning `
  --max-messages 1
```

Verify `dispatch.command.mock.result`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.mock.result `
  --from-beginning `
  --max-messages 1
```

Verify `dispatch_execution_audit`:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT dispatch_command_id, proposed_action, mock_device_type, simulation_status, no_real_execution, execution_mode FROM dispatch_execution_audit ORDER BY created_at DESC LIMIT 10;"
```

Verify the HTTP audit endpoint:

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/mock-dispatch/audit" -Method Get
```

Verify no real execution happened:

All mock output must include:

```json
{
  "simulated": true,
  "no_real_execution": true,
  "execution_mode": "mock"
}
```

## F. Testing Guide

Run Compose validation:

```powershell
docker compose config
```

Run mock dispatch adapter tests:

```powershell
node --test services/mock-dispatch-adapter/test/*.test.js
```

Run all Node tests:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js services/ieee20305-translator/test/*.test.js services/aggregator/test/*.test.js services/approval-workflow/test/*.test.js services/mock-dispatch-adapter/test/*.test.js
```

Test valid mock dispatch:

1. Send a DSO grid signal.
2. Review, approve, and mark the proposal ready.
3. Check `dispatch.command.mock.sent`.
4. Check `dispatch.command.mock.result`.
5. Check `dispatch_execution_audit`.

Test invalid ready event:

Publish a ready-like event without `no_execution = true`. The mock adapter should reject it, publish a mock audit failure, and not create mock sent or mock result events.

Check Kafka topics:

```powershell
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --list
```

Check database rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT simulation_status, no_real_execution, execution_mode FROM dispatch_execution_audit ORDER BY created_at DESC LIMIT 10;"
```

Check HTTP endpoints:

```powershell
Invoke-RestMethod -Uri "http://localhost:3005/health" -Method Get
Invoke-RestMethod -Uri "http://localhost:3005/mock-dispatch/audit" -Method Get
```

## G. Example Walkthrough

Example:

```text
DSO curtailment request
  -> Aggregator creates reduce_ev_charging proposal
  -> Approval workflow marks it ready_to_dispatch
  -> Mock dispatch adapter simulates EV charger command
  -> Mock sent event is published
  -> Mock result event is published
  -> Audit row is stored
  -> no real household device is controlled
```

Detailed walkthrough:

1. A DSO sends a curtailment request.
2. The IEEE 2030.5 translator publishes a `GridSignal`.
3. The Aggregator creates a `reduce_ev_charging` proposal.
4. A reviewer reviews and approves the proposal.
5. A reviewer marks it `ready_to_dispatch`.
6. The approval workflow publishes `dispatch.command.ready`.
7. The mock dispatch adapter validates the ready event.
8. The adapter maps `reduce_ev_charging` to an `ev_charger` mock command.
9. The adapter publishes a simulated sent event.
10. The adapter publishes a simulated result event.
11. The adapter writes `dispatch_execution_audit`.
12. The adapter publishes `dispatch.mock.audit`.
13. No real EV charger or household device is controlled.

## H. Limitations

Phase 7 does not include:

- real household control
- physical device adapters
- production security hardening
- mTLS
- ENERSHARE export
- automatic rollback
- real customer consent workflow

The mock adapter only tests simulated command preparation. It should not be connected to real household devices.

## I. Next Phase Recommendation

Phase 8 should add an ENERSHARE or dataspace export foundation.

Phase 8 should export approved, mock, and audited outputs to a dataspace-style API. It should not expose private household data without filtering, minimization, and access-control rules.
