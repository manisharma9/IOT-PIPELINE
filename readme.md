# Smart Grid Communication Pipeline

Smart Grid Communication Pipeline for smart-home energy flexibility. It shows how household telemetry can move from a local production-style security edge to semantic energy meaning, grid signal translation, safe dispatch proposal governance, mock-only dispatch simulation, simulated device-specific API translation, and minimized IDS/ENERSHARE-ready dataspace export.

This repository is a local development foundation for a production-style DSO communication pipeline. It is not a production control system.

## Business Problem

Distribution system operators and energy communities need a safer way to understand household flexibility. Raw IoT readings are hard to compare, grid signals must be translated into clear actions, and any dispatch workflow needs approval, auditability, and privacy controls before external sharing.

This project demonstrates that path without controlling real household devices.

## Final Architecture Flow

```text
External HTTP clients / frontend / DSO
-> security-gateway
-> authentication / rate limiting / IP filtering / DPI-style inspection
-> ingestion-api / DSO grid signal / approval / dataspace / audit routes

HTTP telemetry
-> ingestion-api
-> raw.telemetry

MQTT telemetry
-> mqtt-broker
-> mqtt-subscriber
-> raw.telemetry

raw.telemetry
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
- device-command-translator -> Shelly Plug / Enode Easee Core / Heat Pump simulators -> device.command.result
-> dataspace-export
-> minimized dataspace summaries
```

Production-style local entry point: external HTTP traffic should use `http://localhost:3010` through `security-gateway`. Direct service ports remain exposed for local development and debugging only.

Safety boundary: the pipeline stops at mock dispatch and simulated device API calls. No real household command is sent.

## Device API Translation Layer

The pipeline supports bidirectional load management. DSO requests move forward through semantic and IEEE 2030.5-style translation, while approved dispatch commands are translated back into simulated end-device API language.

This repository now includes simulated adapters for:

- Shelly Plug through `shelly-simulator`
- Enode / Easee Core EV charger through `enode-simulator`
- Heat Pump through `heat-pump-simulator`

The `device-command-translator` consumes approved `dispatch.command.ready` events and translates fixed kW or percentage load reduction into simulated device commands. It never uses real credentials and never controls real devices.

The simulator layer follows a small BaseDevice-style contract. Simulated devices expose `tick()` and `getTelemetry()` behavior and can produce compatible telemetry with:

```json
{
  "deviceId": "heat-pump-001",
  "deviceType": "heat_pump",
  "timestamp": "2026-05-25T12:00:00Z",
  "data": {
    "heat_pump_power_kw": {
      "value": 2.1,
      "unit": "kW"
    }
  }
}
```

The ingestion path normalizes this shape into the existing pipeline schema before publishing to Kafka, so existing topics and TimescaleDB inserts continue to work.

## Customer Operator Console

The customer-facing web application lives in `apps/customer-console`. It is a Next.js and TypeScript dashboard designed for local operation now and later deployment to Vercel.

The console follows the production-style access boundary:

```text
Browser
-> Next.js API routes
-> security-gateway at GATEWAY_BASE_URL
-> internal AD-FLEX services
```

The browser does not call internal service ports directly. The gateway API key stays server-side in Next.js API routes and is not exposed to client components.

Local setup:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
copy .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with the configured local demo operator credentials. The console includes local demo authentication, gateway health, telemetry simulation, DSO load request submission, proposal review actions, safe mock dispatch audit, simulated Shelly Plug, Heat Pump, and Enode / Easee Core device translation audit, dataspace export views, AWS readiness, and runbook guidance.

Production authentication can later be connected to Cognito, Auth0, or another JWT issuer. Real device control must not be enabled without real credentials, consent, operator approval, and safety controls.

## System Capabilities

| Module | Reference Release | Capability |
| --- | --- | --- |
| Foundation | `phase-1-foundation-v1` | HTTP/MQTT ingestion, Kafka backbone, engine normalization, TimescaleDB storage. |
| Semantic mapping | `phase-2-saref4ener-v1` | Deterministic SAREF4ENER/NGSI semantic validation and fallback in `semantic_events`. |
| SLM-primary mapping | `phase-3-slm-assisted-v1` | Local Ollama/Phi-3 Mini semantic interpretation used as the primary mapping path, with deterministic SAREF4ENER validation and fallback. |
| IEEE translator | `phase-4-ieee20305-v1` | IEEE 2030.5-style translator foundation and mock DSO grid signal endpoint. |
| Aggregator | `phase-5-aggregator-v1` | Proposal-only aggregator and dispatch command audit path. |
| Approval workflow | `phase-6-approval-workflow-v1` | Review, approve, reject, and mark-ready workflow with audit. |
| Mock dispatch | `phase-7-mock-dispatch-v1` | Safe mock dispatch adapter with simulated sent/result events. |
| Dataspace export | `phase-8-dataspace-export-v1` | Minimized, pseudonymized IDS/ENERSHARE-ready dataspace export foundation. |
| Production hardening | current | Final technical documentation, runbooks, scripts, troubleshooting, and demo environment polish. |

## Services And Ports

| Service | Port | Role |
| --- | ---: | --- |
| `security-gateway` | 3010 | Local production-style external entry point with API key, rate limiting, IP filtering, DPI-style inspection, and audit. |
| `ingestion-api` | 3001 | Receives HTTP telemetry and publishes `raw.telemetry`. |
| `mqtt-subscriber` | none | Subscribes to MQTT telemetry and publishes `raw.telemetry`. |
| `engine` | none | Normalizes raw telemetry and publishes `normalized.telemetry`. |
| `semantic-connector` | none | Uses local Phi-3 Mini as the primary semantic interpretation layer, with deterministic SAREF4ENER validation and fallback. |
| `ieee20305-translator` | 3002 | Translates semantic events and accepts mock DSO grid signals. |
| `aggregator` | 3003 | Creates proposal-only dispatch commands. |
| `approval-workflow` | 3004 | Manages safe proposal status transitions. |
| `mock-dispatch-adapter` | 3005 | Simulates dispatch preparation only. |
| `dataspace-export` | 3006 | Exposes minimized, pseudonymized dataspace-style summaries. |
| `shelly-simulator` | 3007 | Local simulated Shelly Plug API. |
| `enode-simulator` | 3008 | Local simulated Enode / Easee Core charger API. |
| `heat-pump-simulator` | 3011 | Local simulated Heat Pump API with `tick()` and `getTelemetry()` behavior. |
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
| `security.gateway.audit` | Accepted, blocked, rate-limited, unauthorized, and downstream-error gateway audit events. |
| `dataspace.catalog` | IDS/ENERSHARE-ready dataspace catalog metadata. |
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
| `device_command_audit` | Device API translation audit history for simulated Shelly, Enode, Easee Core, and Heat Pump command translation. |
| `security_gateway_audit` | Local edge security decision audit history. |
| `dataspace_exports` | Phase 8 export/catalog audit history. |

## Run The Full Demo

Prerequisites:

- Docker Desktop running.
- PowerShell.
- Recommended: Ollama with `phi3:mini` for the primary local SLM semantic interpretation path. If Ollama is unavailable, deterministic SAREF4ENER fallback keeps the local demo running.

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
```

Stop the demo without deleting local data:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

### Multi-Household Validation

Run the reusable production-style scenario with five households, fifteen independent devices, and two telemetry updates per device:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-multi-household-validation.ps1 -Households 5 -Cycles 2
```

The runner sends telemetry through the security gateway, waits for semantic and IEEE 2030.5-style persistence, completes the safe DSO approval/mock dispatch/device translation path, requests a minimized dataspace export, and writes machine-readable evidence to `docs/demo-assets/multi-household-validation-results.json`.

The measured implementation report is available at [docs/multi-household-scalability-validation-report.md](docs/multi-household-scalability-validation-report.md). The stakeholder Word report is available at [docs/multi-household-pipeline-validation-report.docx](docs/multi-household-pipeline-validation-report.docx).

## Validate The Demo Manually

Production-style local calls should go through the gateway:

Send normal telemetry:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/telemetry `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" } `
  -ContentType application/json `
  -Body (Get-Content .\examples\household_telemetry.json -Raw)
```

Send simulator-style telemetry through the compatibility alias:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/api/ingest `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" } `
  -ContentType application/json `
  -Body (Get-Content .\examples\heat_pump_telemetry.json -Raw)
```

Send a DSO grid signal:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/dso/grid-signal `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" } `
  -ContentType application/json `
  -Body (Get-Content .\examples\dso_grid_signal.json -Raw)
```

Review, approve, and mark a proposal ready:

```powershell
$edge = @{ "x-edge-api-key" = "local-dev-edge-key" }
$proposal = (Invoke-RestMethod -Headers $edge http://localhost:3010/dispatch/proposals?limit=1).proposals[0]
Invoke-RestMethod -Method Post -Uri "http://localhost:3010/approvals/proposals/$($proposal.id)/review" -Headers $edge -ContentType application/json -Body (Get-Content .\examples\approval_review_request.json -Raw)
Invoke-RestMethod -Method Post -Uri "http://localhost:3010/approvals/proposals/$($proposal.id)/approve" -Headers $edge -ContentType application/json -Body (Get-Content .\examples\approval_approve_request.json -Raw)
Invoke-RestMethod -Method Post -Uri "http://localhost:3010/approvals/proposals/$($proposal.id)/mark-ready" -Headers $edge -ContentType application/json -Body (Get-Content .\examples\approval_mark_ready_request.json -Raw)
```

Check simulated device API translation:

```powershell
Invoke-RestMethod -Headers $edge http://localhost:3010/device-command/audit?limit=5
```

Call the safe dataspace export:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3010/dataspace/export/full-pipeline-demo-summary `
  -Headers $edge
```

## Safety Limitations

- No real household command execution.
- Mock dispatch and simulated device API translation only.
- No real Shelly credentials, Enode credentials, Easee Core charger control, or heat pump control.
- No certified IEEE 2030.5 implementation.
- No certified ENERSHARE connector.
- No production mTLS, OAuth/OIDC, contract negotiation, or real connector credentials.
- API key protection is local development only.
- The local security gateway is a development foundation for API Gateway/WAF readiness, not production security by itself.
- Dataspace export is minimized and pseudonymized, but not production privacy compliance by itself.
- The Semantic Connector uses local Phi-3 Mini as the primary semantic interpretation layer. Deterministic SAREF4ENER mapping remains active as validation and fallback when the SLM is unavailable, invalid, low confidence, or inconsistent with known readings.

## Client-Facing Technical Talking Points

- The pipeline turns raw IoT telemetry into structured energy-flexibility knowledge.
- Security gateway aligns local external traffic with the production API Gateway/WAF pattern.
- Local Phi-3 Mini provides the primary semantic interpretation path without using cloud AI.
- SAREF4ENER deterministic mapping validates known readings and provides a fallback when SLM output is invalid or unavailable.
- IEEE 2030.5-style translation gives a bridge toward grid/DER concepts without claiming certification.
- Aggregator and approval workflow keep dispatch proposal creation separate from execution.
- Mock dispatch proves the workflow end to end without controlling a real device.
- Device API translation shows the approved command can be converted into Shelly Plug, Enode / Easee Core, and Heat Pump API language while remaining simulated.
- Dataspace export shares only minimized, pseudonymized IDS/ENERSHARE-ready summaries for external stakeholders.

## Key Documentation

- [Final architecture](docs/final-architecture.md)
- [Demo environment runbook](docs/final-demo-runbook.md)
- [Client-facing presentation script](docs/final-presentation-script.md)
- [Troubleshooting guide](docs/troubleshooting.md)
- [Security and limitations](docs/security-and-limitations.md)
- [Production hardening and demo environment report](docs/phase-9-final-demo-polish-report.md)
- [Device API translation layer report](docs/scope-alignment-device-api-translation-report.md)
- [Architecture component mapping](docs/diagram-alignment-matrix.md)
- [Security edge implementation report](docs/production-alignment-security-edge-report.md)
- [OpenAPI-style local API contract](docs/openapi-adflex.yaml)
- [README and architecture alignment report](docs/readme-alignment-report.md)
- [AWS deployment skeleton](infra/aws/README.md)
- [Connector placeholders](connectors/README.md)
