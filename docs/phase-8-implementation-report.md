# Phase 8 Implementation Report: ENERSHARE / Dataspace Export Foundation

## A. Phase 8 Overview

Phase 8 adds a dataspace-style export foundation to the AD-FLEX pipeline.

The earlier phases created this working path:

```text
HTTP / MQTT telemetry
  -> raw.telemetry
  -> engine
  -> normalized.telemetry
  -> semantic-connector
  -> semantic.enriched
  -> ieee20305-translator
  -> grid.signals
  -> aggregator
  -> dispatch.command.proposed
  -> approval-workflow
  -> dispatch.command.ready
  -> mock-dispatch-adapter
  -> dispatch.command.mock.sent
  -> dispatch.command.mock.result
  -> dispatch_execution_audit
```

Phase 8 does not change that control path. Instead, it reads safe summaries from the existing TimescaleDB tables and exposes them through a local dataspace-style API.

What Phase 8 added:

- a new `dataspace-export` Node.js service
- local API key protection for export endpoints
- a catalog API that lists shareable export assets
- minimized export endpoints
- household and device pseudonymization
- a `dataspace_exports` TimescaleDB hypertable
- Kafka publishing to `dataspace.catalog`
- Kafka publishing to `dataspace.export.audit`
- tests for access control, minimization, pseudonymization, catalog publishing, and full pipeline summaries

Why dataspace export is needed:

Energy data pipelines often need to share status or summary information with outside stakeholders. In a real ENERSHARE or dataspace setup, that sharing would involve connector identity, policies, contract negotiation, and secure transport. Phase 8 creates the foundation for that idea without claiming production certification.

How it extends Phase 7:

Phase 7 ends with a simulated mock dispatch result and a `dispatch_execution_audit` row. Phase 8 reads that audit trail, plus earlier semantic, grid, proposal, and approval records, and creates safe external-facing summaries.

Why this is only a foundation:

This phase does not implement a real ENERSHARE connector, EDC connector, credential exchange, mTLS, OAuth/OIDC, contract negotiation, or live external dataspace publication. It is a local service that demonstrates how exports can be filtered, minimized, pseudonymized, audited, and published to Kafka topics.

## B. Architecture

Main Phase 8 flow:

```text
TimescaleDB pipeline tables
        |
        v
dataspace-export
        |
        +--> filtered export assets
        |
        +--> Kafka topic: dataspace.catalog
        |
        +--> Kafka topic: dataspace.export.audit
        |
        v
TimescaleDB hypertable: dataspace_exports
```

The service reads from these existing tables:

- `semantic_events`
- `ieee20305_events`
- `dispatch_commands`
- `dispatch_approval_audit`
- `dispatch_execution_audit`

The service writes to:

- `dataspace_exports`

The service publishes to:

- `dataspace.catalog`
- `dataspace.export.audit`

The most important design choice is that the service does not expose the raw pipeline payloads. It builds shareable summary assets instead.

## C. What Was Implemented

### Dataspace export service

The new service is:

```text
services/dataspace-export
```

It uses:

- Node.js
- Express
- KafkaJS
- `pg` for TimescaleDB/PostgreSQL

It exposes:

- `GET /health`
- `GET /dataspace/catalog`
- `GET /dataspace/assets`
- `GET /dataspace/assets/:assetId`
- `GET /dataspace/export/semantic-summary`
- `GET /dataspace/export/grid-signal-summary`
- `GET /dataspace/export/dispatch-proposal-summary`
- `GET /dataspace/export/approval-audit-summary`
- `GET /dataspace/export/mock-dispatch-summary`
- `GET /dataspace/export/full-pipeline-demo-summary`
- `POST /dataspace/catalog/publish`

### Catalog endpoints

The catalog endpoints list the export assets that this local dataspace foundation can provide.

The asset ids are:

- `semantic-summary`
- `grid-signal-summary`
- `dispatch-proposal-summary`
- `approval-audit-summary`
- `mock-dispatch-summary`
- `full-pipeline-demo-summary`

The catalog clearly states that this is a foundation only and not a certified ENERSHARE connector.

### Export endpoints

Export endpoints require:

```text
x-api-key: local-dev-dataspace-key
```

The API key comes from `DATASPACE_API_KEY`.

If the key is missing or wrong, the service returns:

```json
{
  "error": "unauthorized_dataspace_request"
}
```

This is basic local development protection only. It is not production identity or access management.

### Data minimization policy

The export service applies these rules:

- never return raw telemetry payloads
- never return raw semantic, IEEE 2030.5, approval, or mock source payloads
- pseudonymize `household_id`
- pseudonymize `device_id`
- keep `community_id` visible because it is a community-level grouping
- include only fields useful for sharing and explaining the demo
- cap row counts with `DATASPACE_MAX_RECORDS`

### Pseudonymization helper

The service hashes household and device identifiers with:

```text
DATASPACE_PSEUDONYMIZATION_SALT
```

The output looks like:

```text
household_3f0a1c2b4d5e
device_9a8b7c6d5e4f
```

The same input and salt produce the same pseudonym, which is useful for demos and repeated exports. The original `household_id` and `device_id` are not returned in export responses.

### Dataspace exports table

Phase 8 adds:

```text
database/timescale/007_dataspace_exports.sql
```

It creates:

```text
dataspace_exports
```

The table stores:

- export type
- requester metadata
- community id
- asset id
- record count
- access policy
- minimization and pseudonymization flags
- export status
- export payload
- audit payload
- correlation id

### Kafka topics

Phase 8 adds:

- `dataspace.catalog`
- `dataspace.export.audit`

`dataspace.catalog` receives catalog metadata when the catalog is published.

`dataspace.export.audit` receives an audit event whenever an export is produced or the catalog is published.

### Docker Compose changes

`docker-compose.yml` now includes:

```text
dataspace-export
```

The service depends on:

- Kafka
- TimescaleDB

It exposes:

```text
3006:3006
```

### Tests

Tests were added under:

```text
services/dataspace-export/test
```

The tests do not require live Kafka or live TimescaleDB.

They cover:

- health endpoint without API key
- export endpoint API key requirement
- wrong API key rejection
- catalog metadata
- semantic export minimization
- household pseudonymization
- device pseudonymization
- raw payload exclusion
- max record limit
- audit payload creation
- catalog event payload creation
- full pipeline demo summary sections

## D. File-By-File Explanation

### `services/dataspace-export/src/index.js`

Starts the Express API.

It creates:

- health endpoint
- catalog endpoints
- asset endpoints
- protected export endpoints
- catalog publish endpoint

It also wires the service to:

- TimescaleDB
- Kafka producer
- API key middleware
- export audit writing

The service never exposes an endpoint for dispatching commands or controlling devices.

### `services/dataspace-export/src/policy.js`

Defines:

- allowed export types
- asset ids
- access policy text
- minimization rules
- limitations
- catalog metadata builder
- max record limit helpers

This file is the plain-language policy layer for Phase 8.

### `services/dataspace-export/src/pseudonymize.js`

Hashes household and device identifiers using SHA-256 and a salt.

It returns stable pseudonyms:

- `household_xxxxx`
- `device_xxxxx`

It does not return original identifiers.

### `services/dataspace-export/src/export-builder.js`

Turns database rows into safe export payloads.

It removes raw payload fields and builds:

- semantic summary rows
- grid signal summary rows
- dispatch proposal summary rows
- approval audit summary rows
- mock dispatch summary rows
- full pipeline demo summary

Every export includes:

- `export_type`
- `generated_at`
- `access_policy`
- `minimization_applied: true`
- `pseudonymization_applied: true`
- `community_id`
- `record_count`
- `data`
- `limitations`
- `no_raw_private_payloads: true`

### `services/dataspace-export/src/db.js`

Connects to TimescaleDB.

It provides:

- `getSemanticSummary`
- `getGridSignalSummary`
- `getDispatchProposalSummary`
- `getApprovalAuditSummary`
- `getMockDispatchSummary`
- `getFullPipelineDemoSummary`
- `insertExportAudit`

It also creates the `dataspace_exports` table on startup if needed, which helps local Docker volumes that were already initialized before Phase 8.

### `services/dataspace-export/src/kafka.js`

Creates the Kafka producer and publishes JSON events.

It supports:

- publishing catalog metadata to `dataspace.catalog`
- publishing export audit events to `dataspace.export.audit`

### `database/timescale/007_dataspace_exports.sql`

Creates the `dataspace_exports` hypertable.

It uses `event_time` as the TimescaleDB time column.

It adds indexes for:

- creation time
- export type
- community id
- export status
- correlation id

### `examples/dataspace_catalog_example.json`

Shows a sample dataspace catalog response with asset metadata.

### `examples/dataspace_export_request_headers.txt`

Shows the local API key header:

```text
x-api-key: local-dev-dataspace-key
```

### `examples/dataspace_full_pipeline_export_example.json`

Shows a safe full pipeline export shape.

It uses pseudonymized household and device references and contains no raw telemetry payload.

### `docker-compose.yml`

Adds the `dataspace-export` service.

It passes:

- Kafka settings
- TimescaleDB settings
- dataspace service port
- local API key
- catalog topic
- export audit topic
- default community
- pseudonymization salt
- max record count

### `.env.example`

Adds Phase 8 local defaults:

```text
DATASPACE_EXPORT_PORT=3006
DATASPACE_API_KEY=local-dev-dataspace-key
DATASPACE_CATALOG_TOPIC=dataspace.catalog
DATASPACE_EXPORT_AUDIT_TOPIC=dataspace.export.audit
DATASPACE_DEFAULT_COMMUNITY=community-dublin-north
DATASPACE_PSEUDONYMIZATION_SALT=local-dev-salt
DATASPACE_MAX_RECORDS=100
```

These are development values only. Real secrets should not be committed.

### `README.md`

Adds Phase 8 architecture, components, run commands, export examples, Kafka checks, database checks, tests, and limitations.

### Tests

The tests live in:

```text
services/dataspace-export/test
```

They use mocked database and Kafka helpers, so they run without live infrastructure.

## E. Step-By-Step Run Guide

Open PowerShell and go to the repository:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

Copy the example environment file if `.env` does not exist:

```powershell
Copy-Item .env.example .env
```

Start Docker Desktop.

Start the required services:

```powershell
docker compose up -d --build `
  zookeeper `
  kafka `
  mqtt-broker `
  timescaledb `
  ingestion-api `
  mqtt-subscriber `
  engine `
  semantic-connector `
  ieee20305-translator `
  aggregator `
  approval-workflow `
  mock-dispatch-adapter `
  dataspace-export
```

If the TimescaleDB Docker volume already existed before Phase 8, apply the new migration manually:

```powershell
docker compose exec -T timescaledb psql `
  -v ON_ERROR_STOP=1 `
  -U energy_user `
  -d energy_flex `
  -f /docker-entrypoint-initdb.d/007_dataspace_exports.sql
```

Run the full pipeline up to mock dispatch.

Send a DSO grid signal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/dso_grid_signal.json"
```

Find the latest proposal id:

```powershell
$proposalId = (docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -t `
  -A `
  -c "SELECT id FROM dispatch_commands ORDER BY created_at DESC LIMIT 1;").Trim()
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

Verify mock dispatch completed:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT dispatch_command_id, proposed_action, simulation_status, no_real_execution, execution_mode FROM dispatch_execution_audit ORDER BY created_at DESC LIMIT 5;"
```

Call the dataspace catalog:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/catalog" `
  -Method Get
```

Call the full pipeline demo export with the API key:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/full-pipeline-demo-summary" `
  -Method Get `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }
```

Verify `dataspace.export.audit`:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dataspace.export.audit `
  --from-beginning `
  --max-messages 1 `
  --timeout-ms 5000
```

Verify `dataspace_exports` rows:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT export_type, asset_id, record_count, minimization_applied, pseudonymization_applied, export_status FROM dataspace_exports ORDER BY created_at DESC LIMIT 10;"
```

Verify no raw private payloads are exposed:

```powershell
$export = Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/full-pipeline-demo-summary" `
  -Method Get `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }

$export | ConvertTo-Json -Depth 20
```

Check that the response uses `household_xxxxx` and `device_xxxxx` references instead of raw IDs.

## F. Testing Guide

Run Phase 8 tests:

```powershell
node --test services/dataspace-export/test/*.test.js
```

Run the full Node test suite:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js services/ieee20305-translator/test/*.test.js services/aggregator/test/*.test.js services/approval-workflow/test/*.test.js services/mock-dispatch-adapter/test/*.test.js services/dataspace-export/test/*.test.js
```

Test API key protection:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/semantic-summary" `
  -Method Get
```

Expected result:

```text
HTTP 401 unauthorized_dataspace_request
```

Test the catalog:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/catalog" `
  -Method Get
```

Test the semantic summary:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/semantic-summary" `
  -Method Get `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }
```

Test the full pipeline demo summary:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/full-pipeline-demo-summary" `
  -Method Get `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }
```

Confirm pseudonymization:

```powershell
$export = Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/full-pipeline-demo-summary" `
  -Method Get `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }

$export | ConvertTo-Json -Depth 20
```

Look for values like:

```text
household_...
device_...
```

Confirm audit rows:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT export_type, asset_id, record_count, export_status FROM dataspace_exports ORDER BY created_at DESC LIMIT 10;"
```

Check Kafka topics:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dataspace.export.audit `
  --from-beginning `
  --max-messages 1 `
  --timeout-ms 5000
```

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dataspace.catalog `
  --from-beginning `
  --max-messages 1 `
  --timeout-ms 5000
```

## G. Example Walkthrough

Example:

```text
DSO curtailment request
  -> aggregator creates proposal
  -> approval workflow marks ready
  -> mock dispatch adapter simulates result
  -> dataspace export service publishes safe summary
  -> outside stakeholder can see status without raw household data
```

Step by step:

1. A DSO sends a `curtailment_request` asking the community to `reduce_load`.
2. The IEEE 2030.5 translator validates the request and publishes a `GridSignal`.
3. The Aggregator creates a proposal, such as `reduce_ev_charging`.
4. The approval workflow reviews, approves, and marks the proposal `ready_to_dispatch`.
5. The mock dispatch adapter simulates an EV charger command.
6. The mock adapter writes `dispatch_execution_audit`.
7. The dataspace export service reads the relevant tables.
8. It builds a `full_pipeline_demo_summary`.
9. It pseudonymizes household and device identifiers.
10. It returns a safe summary to the requester.
11. It writes a `dataspace_exports` audit row.
12. It publishes an audit event to `dataspace.export.audit`.

The outside stakeholder can see the shape and status of the flexibility workflow without receiving raw household telemetry or raw device identifiers.

## H. Limitations

Phase 8 is intentionally limited.

It does not include:

- certified ENERSHARE connector behavior
- real EDC connector integration
- production identity provider
- OAuth/OIDC
- mTLS
- contract negotiation
- real external dataspace publication
- real connector credentials
- raw private household telemetry export
- real household dispatch
- real device control

The API key is for local development only.

Data minimization is basic but explicit. It removes raw payloads and pseudonymizes household and device identifiers, but a production system would need more formal policy enforcement, legal review, consent handling, retention rules, and security hardening.

## I. Next Phase Recommendation

Recommended Phase 9:

```text
Production hardening and final demo polish
```

Phase 9 should include:

- security hardening
- environment cleanup
- better logs
- health checks
- final README polish
- final architecture diagram
- final demo script
- optional dashboard update showing all phases

Phase 9 should not introduce uncontrolled real household dispatch. It should make the existing demo cleaner, safer, easier to run, and easier to present.
