# Phase 6 Implementation Report: Approval Workflow and Safe Dispatch Preparation

## A. Phase 6 Overview

Phase 6 adds an approval workflow service after the Phase 5 Aggregator.

Phase 5 creates safe dispatch command proposals and stores them in the `dispatch_commands` table with `status = proposed`. Phase 6 lets a reviewer move those proposals through a controlled approval path:

```text
proposed -> reviewed -> approved -> ready_to_dispatch
```

A reviewer can also reject a proposal:

```text
proposed -> rejected
reviewed -> rejected
```

What Phase 6 added:

- a new `approval-workflow` Node.js service
- status transition validation
- approval request validation
- a new `dispatch_approval_audit` TimescaleDB hypertable
- Kafka publishing to `dispatch.approval.audit`
- Kafka publishing to `dispatch.command.ready`
- HTTP endpoints for reviewing, approving, rejecting, and marking proposals ready
- tests for workflow rules, validation, ready events, audit events, and HTTP endpoints

Why approval workflow is needed:

The Aggregator creates proposals automatically. Before any later phase prepares a command for dispatch, a human or governance workflow should review the proposal. Phase 6 creates that approval layer without adding real device control.

How it extends Phase 5:

Phase 5 ends at:

```text
dispatch.command.proposed
dispatch_commands status = proposed
```

Phase 6 starts from those proposal records and manages their approval status.

Why this phase is still not command execution:

`ready_to_dispatch` means the proposal has passed the Phase 6 approval workflow and is ready for a future dispatch preparation phase. It does not mean a household command was sent. Ready events explicitly include:

```json
{
  "no_execution": true,
  "execution_blocked": true,
  "message": "Ready for dispatch preparation only. No device command executed."
}
```

## B. Architecture

Phase 6 flow:

```text
dispatch.command.proposed
        |
        v
approval-workflow
        |
        +--> dispatch_commands status update
        |
        +--> dispatch_approval_audit
        |
        +--> dispatch.approval.audit
        |
        v
dispatch.command.ready
```

Step by step:

1. The Aggregator publishes a proposal to `dispatch.command.proposed`.
2. The approval workflow service observes the proposal topic.
3. Proposal records remain in `dispatch_commands`, which is the source of truth.
4. A reviewer calls the approval workflow HTTP API.
5. The service validates the request body.
6. The service validates the status transition.
7. The service updates the proposal status in `dispatch_commands`.
8. The service writes an audit row to `dispatch_approval_audit`.
9. The service publishes an audit event to `dispatch.approval.audit`.
10. If the new status is `ready_to_dispatch`, the service publishes a ready event to `dispatch.command.ready`.
11. No household command is executed.

## C. What Was Implemented

### Approval workflow service

The new service is:

```text
services/approval-workflow
```

It uses Node.js, Express, KafkaJS, and `pg`, matching the existing service style.

It consumes:

- `dispatch.command.proposed`

It publishes:

- `dispatch.approval.audit`
- `dispatch.command.ready`

It reads and updates:

- `dispatch_commands`

It writes:

- `dispatch_approval_audit`

### Status machine

Allowed transitions:

- `proposed -> reviewed`
- `proposed -> rejected`
- `reviewed -> approved`
- `reviewed -> rejected`
- `approved -> ready_to_dispatch`

Rejected transitions include:

- `proposed -> approved`
- `proposed -> ready_to_dispatch`
- `rejected -> approved`
- `ready_to_dispatch -> approved`

Invalid transitions return:

```json
{
  "error": "invalid_status_transition"
}
```

### Validation

Approval requests require:

- `reviewer_id`
- `reviewer_role`

Reject requests also require:

- `reason` or `comment`

### Approval audit table

The new table is:

```text
dispatch_approval_audit
```

It stores every approval workflow transition.

Important fields:

- `event_time`
- `created_at`
- `dispatch_command_id`
- `proposal_id`
- `previous_status`
- `new_status`
- `action`
- `reviewer_id`
- `reviewer_role`
- `comment`
- `approval_payload`
- `source_dispatch_command`
- `audit_payload`
- `correlation_id`

### Kafka topics

Phase 6 adds:

- `dispatch.approval.audit`
- `dispatch.command.ready`

### HTTP endpoints

The approval workflow exposes:

- `GET /health`
- `GET /approvals/proposals`
- `GET /approvals/proposals/:id`
- `POST /approvals/proposals/:id/review`
- `POST /approvals/proposals/:id/approve`
- `POST /approvals/proposals/:id/reject`
- `POST /approvals/proposals/:id/mark-ready`

No execute endpoint exists.

### Ready-to-dispatch event

Ready events are published only after:

```text
approved -> ready_to_dispatch
```

Every ready event includes:

- `no_execution: true`
- `execution_blocked: true`
- `message: "Ready for dispatch preparation only. No device command executed."`

### Tests

Tests cover:

- allowed transitions
- rejected transitions
- missing reviewer validation
- missing reject comment validation
- ready event safety flags
- audit payload creation
- HTTP health endpoint
- GET proposals endpoint

Tests do not require live Kafka or live TimescaleDB.

## D. File-By-File Explanation

### `services/approval-workflow/src/index.js`

Starts the Express HTTP API, Kafka producer, Kafka consumer, and TimescaleDB pool.

It defines:

- `GET /health`
- `GET /approvals/proposals`
- `GET /approvals/proposals/:id`
- `POST /approvals/proposals/:id/review`
- `POST /approvals/proposals/:id/approve`
- `POST /approvals/proposals/:id/reject`
- `POST /approvals/proposals/:id/mark-ready`

The health response says command execution is disabled.

### `services/approval-workflow/src/status-machine.js`

Defines the allowed Phase 6 statuses and transitions.

Allowed statuses:

- `proposed`
- `reviewed`
- `approved`
- `rejected`
- `ready_to_dispatch`

It rejects all other status movements.

### `services/approval-workflow/src/validation.js`

Validates approval request bodies.

It checks `reviewer_id`, `reviewer_role`, and reject comments or reasons.

### `services/approval-workflow/src/workflow.js`

Contains the workflow logic.

It:

- validates the request
- reads the dispatch command
- validates the transition
- updates `dispatch_commands`
- creates an approval audit payload
- writes `dispatch_approval_audit`
- publishes `dispatch.approval.audit`
- publishes `dispatch.command.ready` only for `ready_to_dispatch`
- never executes a command

### `services/approval-workflow/src/db.js`

Connects to TimescaleDB.

It can:

- create/ensure `dispatch_approval_audit`
- read dispatch command proposals
- update proposal status
- insert audit rows

### `services/approval-workflow/src/kafka.js`

Connects to Kafka.

It:

- observes `dispatch.command.proposed`
- publishes `dispatch.approval.audit`
- publishes `dispatch.command.ready`
- handles bad messages safely

### `database/timescale/005_dispatch_approval_audit.sql`

Creates the `dispatch_approval_audit` hypertable and indexes.

### `examples/approval_review_request.json`

Example review request:

```json
{
  "reviewer_id": "paolo",
  "reviewer_role": "mentor",
  "comment": "Reviewed proposal and it looks reasonable for testing."
}
```

### `examples/approval_approve_request.json`

Example approve request:

```json
{
  "reviewer_id": "paolo",
  "reviewer_role": "mentor",
  "comment": "Approved for safe dispatch preparation only."
}
```

### `examples/approval_reject_request.json`

Example reject request:

```json
{
  "reviewer_id": "paolo",
  "reviewer_role": "mentor",
  "comment": "Rejected because the proposal requires more evidence."
}
```

### `examples/approval_mark_ready_request.json`

Example mark-ready request:

```json
{
  "reviewer_id": "paolo",
  "reviewer_role": "mentor",
  "comment": "Marked ready for dispatch preparation. No command execution allowed."
}
```

### `docker-compose.yml`

Adds the `approval-workflow` service.

It depends on:

- Kafka
- TimescaleDB

It exposes:

```text
3004:3004
```

### `.env.example`

Adds:

```text
APPROVAL_WORKFLOW_PORT=3004
DISPATCH_READY_TOPIC=dispatch.command.ready
DISPATCH_APPROVAL_AUDIT_TOPIC=dispatch.approval.audit
```

### `README.md`

Adds Phase 6 flow, endpoints, status transitions, run instructions, and verification commands.

### Tests

Tests are in:

```text
services/approval-workflow/test
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
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector ieee20305-translator aggregator approval-workflow
```

Send a DSO grid signal:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/dso_grid_signal.json"
```

Verify the dispatch proposal:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT id, requested_action, proposed_action, status FROM dispatch_commands ORDER BY created_at DESC LIMIT 5;"
```

Get proposals through the approval workflow:

```powershell
Invoke-RestMethod -Uri "http://localhost:3004/approvals/proposals" -Method Get
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

Verify `dispatch_approval_audit`:

```powershell
docker compose exec timescaledb psql `
  -U energy_user `
  -d energy_flex `
  -c "SELECT dispatch_command_id, previous_status, new_status, action, reviewer_id FROM dispatch_approval_audit ORDER BY created_at DESC LIMIT 10;"
```

Verify no execution happened:

The ready event must include:

```json
{
  "no_execution": true,
  "execution_blocked": true
}
```

There is no endpoint that sends or executes a household command.

## F. Testing Guide

Run Compose validation:

```powershell
docker compose config
```

Run approval workflow tests:

```powershell
node --test services/approval-workflow/test/*.test.js
```

Run all Node tests:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js services/ieee20305-translator/test/*.test.js services/aggregator/test/*.test.js services/approval-workflow/test/*.test.js
```

Test valid workflow:

1. Send `examples/dso_grid_signal.json`.
2. Read the new proposal id from `dispatch_commands`.
3. Call `/review`.
4. Call `/approve`.
5. Call `/mark-ready`.
6. Confirm status is `ready_to_dispatch`.

Test invalid transition:

Create a fresh `proposed` row by sending a DSO grid signal, then call:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/approve" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_approve_request.json"
```

Expected result:

- HTTP `400`
- `error = invalid_status_transition`

Test rejection:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/reject" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_reject_request.json"
```

Check Kafka topics:

```powershell
docker compose exec kafka kafka-topics --bootstrap-server kafka:29092 --list
```

Check approval audit topic:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.approval.audit `
  --from-beginning `
  --max-messages 1
```

Check database rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT id, status FROM dispatch_commands ORDER BY created_at DESC LIMIT 10;"
```

Check HTTP endpoints:

```powershell
Invoke-RestMethod -Uri "http://localhost:3004/health" -Method Get
Invoke-RestMethod -Uri "http://localhost:3004/approvals/proposals" -Method Get
```

## G. Example Walkthrough

Example:

```text
DSO curtailment request
  -> aggregator creates reduce_ev_charging proposal
  -> reviewer reviews proposal
  -> reviewer approves proposal
  -> reviewer marks it ready_to_dispatch
  -> ready event is published
  -> no household command is executed
```

Detailed walkthrough:

1. A DSO sends a `curtailment_request`.
2. The IEEE 2030.5 translator validates it and publishes `grid.signals`.
3. The Aggregator consumes `grid.signals`.
4. The Aggregator creates a `reduce_ev_charging` proposal.
5. The proposal is stored in `dispatch_commands` with `status = proposed`.
6. The proposal is published to `dispatch.command.proposed`.
7. A reviewer calls `/review`.
8. Status changes from `proposed` to `reviewed`.
9. A reviewer calls `/approve`.
10. Status changes from `reviewed` to `approved`.
11. A reviewer calls `/mark-ready`.
12. Status changes from `approved` to `ready_to_dispatch`.
13. A ready event is published to `dispatch.command.ready`.
14. No household command is executed.

## H. Limitations

Phase 6 does not include:

- household command execution
- real device dispatch
- automatic approval
- production identity provider
- mTLS
- ENERSHARE export
- optimization engine

The service trusts the reviewer fields in local development payloads. A production system would need identity, authentication, authorization, and stronger audit controls.

## I. Next Phase Recommendation

Phase 7 should add a safe dispatch adapter mock.

Phase 7 should still use mock device adapters only. It should not control real household devices.

Recommended direction:

```text
dispatch.command.ready
  -> mock dispatch adapter
  -> simulated command preparation result
  -> audit trail
```

Real household command execution should remain blocked until later security, approval, identity, safety, and rollback controls are designed and validated.
