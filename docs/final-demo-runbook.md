# Final Demo Runbook

This runbook gives a repeatable path for running the full AD-FLEX demo.

## Prerequisites

- Windows with PowerShell.
- Docker Desktop running.
- Repository folder: `C:\Users\Mani\Desktop\Github\IOT-PIPELINE`.
- Optional: Ollama running locally with `phi3:mini` for unknown reading SLM-assisted mapping.

Known readings work without Ollama. Unknown readings fall back safely if Ollama is unavailable.

## 1. Open The Repository

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

## 2. Create Local Environment File

```powershell
copy .env.example .env
```

Do not add real production secrets to `.env`.

## 3. Start Docker Desktop

Open Docker Desktop and wait until it says Docker is running.

## 4. Start The Demo Stack

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
```

The script starts:

- Kafka and Zookeeper
- MQTT broker
- TimescaleDB
- ingestion API
- MQTT subscriber
- engine
- semantic connector
- IEEE 2030.5 translator
- aggregator
- approval workflow
- mock dispatch adapter
- dataspace export

## 5. Check Health Endpoints

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
```

Expected services:

- `ingestion-api`
- `ieee20305-translator`
- `aggregator`
- `approval-workflow`
- `mock-dispatch-adapter`
- `dataspace-export`

## 6. Send Normal Telemetry

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3001/telemetry `
  -ContentType application/json `
  -Body (Get-Content .\examples\household_telemetry.json -Raw)
```

This should flow through:

```text
raw.telemetry -> normalized.telemetry -> semantic.enriched -> ieee20305.translated
```

## 7. Send DSO Grid Signal

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3002/dso/grid-signal `
  -ContentType application/json `
  -Body (Get-Content .\examples\dso_grid_signal.json -Raw)
```

This should publish a `GridSignal` to `grid.signals` and create a proposal through the aggregator.

## 8. Find Latest Proposal

```powershell
$proposal = (Invoke-RestMethod http://localhost:3003/dispatch/proposals?limit=1).proposals[0]
$proposal.id
```

## 9. Review Proposal

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3004/approvals/proposals/$($proposal.id)/review" `
  -ContentType application/json `
  -Body (Get-Content .\examples\approval_review_request.json -Raw)
```

## 10. Approve Proposal

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3004/approvals/proposals/$($proposal.id)/approve" `
  -ContentType application/json `
  -Body (Get-Content .\examples\approval_approve_request.json -Raw)
```

## 11. Mark Proposal Ready

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3004/approvals/proposals/$($proposal.id)/mark-ready" `
  -ContentType application/json `
  -Body (Get-Content .\examples\approval_mark_ready_request.json -Raw)
```

This publishes `dispatch.command.ready` with no-execution safety flags.

## 12. Verify Mock Dispatch

```powershell
Invoke-RestMethod http://localhost:3005/mock-dispatch/audit?limit=5
```

The result should show:

- `execution_mode: mock`
- `no_real_execution: true`
- simulated status and message

## 13. Call Dataspace Export

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3006/dataspace/export/full-pipeline-demo-summary `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }
```

Check that:

- household and device identifiers are pseudonymized
- raw telemetry payloads are not returned
- export metadata says minimization is applied

## 14. Run The Full Demo Script

After the services are healthy, you can run the automated demo path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo.ps1
```

## 15. Check Kafka Topics

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-topics.ps1
```

## 16. Stop Services

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

This stops containers but keeps volumes.

## Common Errors And Fixes

- Docker not running: start Docker Desktop and rerun the script.
- Port already in use: stop old containers or change the port in `.env`.
- Dataspace export returns `401`: add the `x-api-key` header.
- Ollama unavailable: known readings still work; unknown readings fall back safely.
- Proposal not found yet: wait a few seconds and call `/dispatch/proposals` again.
