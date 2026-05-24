# Smart Grid Communication Pipeline Development

Smart Grid Communication Pipeline for smart-home energy flexibility. It shows how household telemetry can move from raw ingestion to semantic energy meaning, grid signal translation, safe dispatch proposal governance, mock-only dispatch simulation, simulated device-specific API translation, and minimized dataspace-style export.

This repository is presentation-ready for the final Phase 9 demo. It is a local development foundation, not a production control system.

## Business Problem

Distribution system operators and energy communities need a safer way to understand household flexibility. Raw IoT readings are hard to compare, grid signals must be translated into clear actions, and any dispatch workflow needs approval, auditability, and privacy controls before external sharing.

This project demonstrates that path without controlling real household devices.

## Final Architecture Flow

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
- mock-dispatch-adapter -> dispatch.command.mock.sent / dispatch.command.mock.result
- device-command-translator -> Shelly Plug / Enode Easee Core simulators -> device.command.result
-> dataspace-export
-> minimized dataspace summaries
```

Safety boundary: the pipeline stops at mock dispatch and simulated device API calls. No real household command is sent.

## Scope Alignment: Device API Translation

Paolo clarified that the final scope needs bidirectional logic. The DSO request moves forward through semantic and IEEE 2030.5-style translation. After approval, the command moves backward into the API language of end devices.

This repository now includes simulated adapters for:

- Shelly Plug through `shelly-simulator`
- Enode / Easee Core EV charger through `enode-simulator`

The `device-command-translator` consumes approved `dispatch.command.ready` events and translates fixed kW or percentage load reduction into simulated device commands. It never uses real credentials and never controls real devices.

## Phase Summary

| Phase | Release | What It Added |
| --- | --- | --- |
| 1 | `phase-1-foundation-v1` | HTTP/MQTT ingestion, Kafka backbone, engine normalization, TimescaleDB storage. |
| 2 | `phase-2-saref4ener-v1` | Deterministic SAREF4ENER/NGSI semantic mapping and `semantic_events`. |
| 3 | `phase-3-slm-assisted-v1` | Optional Ollama/Phi-3 Mini mapping for unknown readings only. |
| 4 | `phase-4-ieee20305-v1` | IEEE 2030.5-style translator foundation and mock DSO grid signal endpoint. |
| 5 | `phase-5-aggregator-v1` | Proposal-only aggregator and dispatch command audit path. |
| 6 | `phase-6-approval-workflow-v1` | Review, approve, reject, and mark-ready workflow with audit. |
| 7 | `phase-7-mock-dispatch-v1` | Safe mock dispatch adapter with simulated sent/result events. |
| 8 | `phase-8-dataspace-export-v1` | Minimized, pseudonymized dataspace-style export foundation. |
| 9 | current | Final documentation, runbooks, scripts, troubleshooting, and demo polish. |

## Services And Ports

| Service | Port | Role |
| --- | ---: | --- |
| `ingestion-api` | 3001 | Receives HTTP telemetry and publishes `raw.telemetry`. |
| `mqtt-subscriber` | none | Subscribes to MQTT telemetry and publishes `raw.telemetry`. |
| `engine` | none | Normalizes raw telemetry and publishes `normalized.telemetry`. |
| `semantic-connector` | none | Adds deterministic SAREF4ENER or optional SLM-assisted semantic mapping. |
| `ieee20305-translator` | 3002 | Translates semantic events and accepts mock DSO grid signals. |
| `aggregator` | 3003 | Creates proposal-only dispatch commands. |
| `approval-workflow` | 3004 | Manages safe proposal status transitions. |
| `mock-dispatch-adapter` | 3005 | Simulates dispatch preparation only. |
| `dataspace-export` | 3006 | Exposes minimized, pseudonymized dataspace-style summaries. |
| `shelly-simulator` | 3007 | Local simulated Shelly Plug API. |
| `enode-simulator` | 3008 | Local simulated Enode / Easee Core charger API. |
| `device-command-translator` | 3009 | Translates approved ready commands into simulated device API calls. |
| `kafka` | 9092 / 29092 | Local event streaming backbone. |
| `timescaledb` | 5432 | Local event and audit database. |
| `mqtt-broker` | 1883 | Local MQTT broker for telemetry input. |

## Kafka Topics

| Topic | Purpose |
| --- | --- |
| `raw.telemetry` | Raw HTTP/MQTT telemetry. |
| `normalized.telemetry` | Validated normalized telemetry from the engine. |
| `semantic.enriched` | SAREF4ENER/NGSI enriched readings. |
| `ieee20305.translated` | Simplified IEEE 2030.5-style telemetry translations. |
| `grid.signals` | Mock DSO grid signal payloads. |
| `dispatch.command.proposed` | Aggregator-created proposal-only dispatch commands. |
| `dispatch.command.audit` | Aggregator proposal audit events. |
| `dispatch.approval.audit` | Approval workflow status transition audit events. |
| `dispatch.command.ready` | Approved proposals marked ready for dispatch preparation only. |
| `dispatch.command.mock.sent` | Simulated mock command preparation events. |
| `dispatch.command.mock.result` | Simulated mock result events. |
| `dispatch.mock.audit` | Mock dispatch audit events. |
| `device.command.result` | Simulated device-specific command result events. |
| `device.command.audit` | Audit events for simulated device API translation. |
| `dataspace.catalog` | Dataspace-style catalog metadata. |
| `dataspace.export.audit` | Dataspace export audit events. |

## TimescaleDB Tables

| Table | Purpose |
| --- | --- |
| `raw_telemetry` | Raw telemetry received by the pipeline. |
| `normalized_telemetry` | Engine-normalized telemetry records. |
| `processing_errors` | Engine validation/processing failures. |
| `semantic_events` | Phase 2/3 semantic mapping events. |
| `ieee20305_events` | Phase 4 translated telemetry and DSO grid signal events. |
| `dispatch_commands` | Phase 5/6 dispatch proposals and status updates. |
| `dispatch_approval_audit` | Phase 6 approval transition audit history. |
| `dispatch_execution_audit` | Phase 7 mock-only dispatch audit history. |
| `device_command_audit` | Scope alignment audit history for simulated Shelly and Enode command translation. |
| `dataspace_exports` | Phase 8 export/catalog audit history. |

## Run The Full Demo

Prerequisites:

- Docker Desktop running.
- PowerShell.
- Optional: Ollama with `phi3:mini` if you want SLM-assisted mapping for unknown readings. Known readings do not require Ollama.

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo.ps1
```

Stop the demo without deleting local data:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

## Validate The Demo Manually

Send normal telemetry:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3001/telemetry `
  -ContentType application/json `
  -Body (Get-Content .\examples\household_telemetry.json -Raw)
```

Send a DSO grid signal:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3002/dso/grid-signal `
  -ContentType application/json `
  -Body (Get-Content .\examples\dso_grid_signal.json -Raw)
```

Review, approve, and mark a proposal ready:

```powershell
$proposal = (Invoke-RestMethod http://localhost:3003/dispatch/proposals?limit=1).proposals[0]
Invoke-RestMethod -Method Post -Uri "http://localhost:3004/approvals/proposals/$($proposal.id)/review" -ContentType application/json -Body (Get-Content .\examples\approval_review_request.json -Raw)
Invoke-RestMethod -Method Post -Uri "http://localhost:3004/approvals/proposals/$($proposal.id)/approve" -ContentType application/json -Body (Get-Content .\examples\approval_approve_request.json -Raw)
Invoke-RestMethod -Method Post -Uri "http://localhost:3004/approvals/proposals/$($proposal.id)/mark-ready" -ContentType application/json -Body (Get-Content .\examples\approval_mark_ready_request.json -Raw)
```

Check simulated device API translation:

```powershell
Invoke-RestMethod http://localhost:3009/device-command/audit?limit=5
```

Call the safe dataspace export:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3006/dataspace/export/full-pipeline-demo-summary `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }
```

## Safety Limitations

- No real household command execution.
- Mock dispatch and simulated device API translation only.
- No real Shelly credentials, Enode credentials, or Easee Core charger control.
- No certified IEEE 2030.5 implementation.
- No certified ENERSHARE connector.
- No production mTLS, OAuth/OIDC, contract negotiation, or real connector credentials.
- API key protection is local development only.
- Dataspace export is minimized and pseudonymized, but not production privacy compliance by itself.
- Optional SLM mapping is used only for unknown readings and is never required for known deterministic mappings.

## Final Demo Talking Points

- The pipeline turns raw IoT telemetry into structured energy-flexibility knowledge.
- SAREF4ENER gives deterministic semantic meaning for known readings.
- SLM-assisted mapping helps only when a reading is unknown, while deterministic mapping remains first.
- IEEE 2030.5-style translation gives a bridge toward grid/DER concepts without claiming certification.
- Aggregator and approval workflow keep dispatch proposal creation separate from execution.
- Mock dispatch proves the workflow end to end without controlling a real device.
- Device API translation shows the approved command can be converted into Shelly Plug and Enode / Easee Core API language while remaining simulated.
- Dataspace export shares only minimized, pseudonymized summaries for external stakeholders.

## Key Documentation

- [Final architecture](docs/final-architecture.md)
- [Final demo runbook](docs/final-demo-runbook.md)
- [Final presentation script](docs/final-presentation-script.md)
- [Troubleshooting guide](docs/troubleshooting.md)
- [Security and limitations](docs/security-and-limitations.md)
- [Phase 9 final demo polish report](docs/phase-9-final-demo-polish-report.md)
- [Scope alignment device API translation report](docs/scope-alignment-device-api-translation-report.md)
