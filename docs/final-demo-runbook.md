# Demo Environment Runbook

This runbook gives a repeatable path for running the AD-FLEX local demo environment.

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

## 4. Start The Local Stack

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
- Shelly Plug simulator
- Enode / Easee Core simulator
- device command translator
- dataspace export
- security gateway

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
- `shelly-simulator`
- `enode-simulator`
- `device-command-translator`
- `security-gateway`

For the production-style local path, external HTTP calls should use:

```text
http://localhost:3010
```

with this header:

```text
x-edge-api-key: local-dev-edge-key
```

## 6. Send Normal Telemetry

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/telemetry `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" } `
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
  -Uri http://localhost:3010/dso/grid-signal `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" } `
  -ContentType application/json `
  -Body (Get-Content .\examples\dso_grid_signal.json -Raw)
```

This should publish a `GridSignal` to `grid.signals` and create a proposal through the aggregator.

## 8. Find Latest Proposal

```powershell
$edge = @{ "x-edge-api-key" = "local-dev-edge-key" }
$proposal = (Invoke-RestMethod -Headers $edge http://localhost:3010/dispatch/proposals?limit=1).proposals[0]
$proposal.id
```

## 9. Review Proposal

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3010/approvals/proposals/$($proposal.id)/review" `
  -Headers $edge `
  -ContentType application/json `
  -Body (Get-Content .\examples\approval_review_request.json -Raw)
```

## 10. Approve Proposal

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3010/approvals/proposals/$($proposal.id)/approve" `
  -Headers $edge `
  -ContentType application/json `
  -Body (Get-Content .\examples\approval_approve_request.json -Raw)
```

## 11. Mark Proposal Ready

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3010/approvals/proposals/$($proposal.id)/mark-ready" `
  -Headers $edge `
  -ContentType application/json `
  -Body (Get-Content .\examples\approval_mark_ready_request.json -Raw)
```

This publishes `dispatch.command.ready` with no-execution safety flags.

## 12. Verify Mock Dispatch

```powershell
Invoke-RestMethod -Headers $edge http://localhost:3010/mock-dispatch/audit?limit=5
```

The result should show:

- `execution_mode: mock`
- `no_real_execution: true`
- simulated status and message

## 13. Verify Simulated Device API Translation

```powershell
Invoke-RestMethod -Headers $edge http://localhost:3010/device-command/audit?limit=5
```

The result should show simulated commands for the local device APIs:

- Shelly Plug actions such as `reduce_load` or `turn_off`
- Enode / Easee Core actions such as `reduce_charging_power` or `pause_charging`
- `execution_mode: simulated_device_api`
- `no_real_execution: true`

You can also call the simulators directly:

```powershell
Invoke-RestMethod http://localhost:3007/shelly/status
Invoke-RestMethod http://localhost:3008/enode/chargers
```

## 14. Call Dataspace Export

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3010/dataspace/export/full-pipeline-demo-summary `
  -Headers $edge
```

Check that:

- household and device identifiers are pseudonymized
- raw telemetry payloads are not returned
- export metadata says minimization is applied

## 15. Run The Gateway-Based Demo Script

After the services are healthy, you can run the automated demo path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
```

The script also reports `device_command_audit_rows` and `security_gateway_audit_rows` so you can confirm that approved ready commands were translated into simulated device API commands and that gateway traffic was audited.

## 16. Check Kafka Topics

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-topics.ps1
```

## 17. Stop Services

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

This stops containers but keeps volumes.

## Common Errors And Fixes

- Docker not running: start Docker Desktop and rerun the script.
- Port already in use: stop old containers or change the port in `.env`.
- Gateway returns `401`: add the `x-edge-api-key` header.
- Dataspace export returns `401` when called directly: add the `x-api-key` header. Through the gateway, use `x-edge-api-key`.
- Ollama unavailable: known readings still work; unknown readings fall back safely.
- Proposal not found yet: wait a few seconds and call `/dispatch/proposals` again.
- Device command audit is empty: confirm `device-command-translator`, `shelly-simulator`, and `enode-simulator` are healthy before marking a proposal ready.
