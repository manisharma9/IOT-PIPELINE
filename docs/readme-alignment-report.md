# README And Architecture Alignment Report

## Overview

This alignment pass brings the repository closer to a simulator-first smart-grid architecture style while preserving the current working AD-FLEX pipeline.

The referenced `SC-Dataspace-VCG` repository was not present as a local sibling checkout, and no public README for that exact project name was available during the local inspection. The alignment was therefore based on the architecture cues requested for this repository:

- a clear simulator layer
- a BaseDevice-style device contract
- telemetry shaped around `deviceId`, `deviceType`, `timestamp`, and `data`
- heat pump simulation
- `/api/ingest` compatibility
- OpenAPI-style API documentation
- stronger IEEE 2030.5 terminology
- stronger IDS/ENERSHARE-ready dataspace wording

## What Changed

### Simulator Architecture Layer

A shared simulator contract was added under `services/common/simulators`.

The simulator layer now includes:

- `BaseDevice`
- `ShellyPlugDevice`
- `EnodeEaseeDevice`
- `HeatPumpDevice`

Each simulated device exposes:

- `tick()`
- `getTelemetry()`

The existing Shelly and Enode simulator endpoints remain in place. A new Heat Pump simulator was added on port `3011`.

### Device Telemetry Compatibility

The ingestion layer now accepts both the existing Phase 1 telemetry shape and a simulator-compatible shape:

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

Before publishing to Kafka, this compatible shape is normalized into the existing pipeline schema:

- `device_id`
- `device_type`
- `readings`
- `protocol`
- `source`

This keeps the existing Kafka topics and TimescaleDB inserts unchanged.

### API Compatibility

The existing gateway route remains:

- `POST /telemetry`

A compatibility alias was added:

- `POST /api/ingest`

Both routes publish into the same `raw.telemetry` pipeline path.

### OpenAPI-Style Documentation

An OpenAPI-style contract was added:

- `docs/openapi-adflex.yaml`

It documents gateway, ingestion, DSO signal, approval, dispatch, mock dispatch, device command, security audit, and dataspace routes.

### IEEE 2030.5 Terminology

The IEEE translator payloads and documentation now make the foundation terminology clearer:

- `MirrorMeter`
- `MirrorMeterReading`
- `DERStatus`
- `DERControlCandidate`
- `GridSignal`
- DSO-facing gateway context

The documentation continues to state clearly that this is not a certified IEEE 2030.5 implementation.

### Dataspace Wording

The dataspace export service is now described as an IDS/ENERSHARE-ready export foundation.

The repository still states clearly that production connector credentials, connector runtime, contract negotiation, and external dataspace publication are future deployment inputs.

## What Is Intentionally Different

This repository remains an event-driven AD-FLEX communication pipeline rather than a direct clone of another repository structure.

The following differences are intentional:

- Existing Phase 1 to Phase 9 services are preserved.
- Kafka remains the backbone between internal services.
- TimescaleDB remains the local event and audit store.
- The security gateway remains the external HTTP entry point.
- Device adapters remain simulated.
- The IEEE 2030.5 translator remains a foundation layer, not a certified protocol stack.
- Dataspace export remains a minimized local foundation, not a certified connector.

## What Remains Future Work

Future production work would include:

- real SCADA/DSO integration contracts
- real device enrollment and consent
- real Shelly credentials and connector hardening
- real Enode/Easee credentials and connector hardening
- heat pump provider API selection
- production OAuth/OIDC or Cognito authentication
- mTLS and managed service-to-service identity
- certified IEEE 2030.5 implementation if required
- real IDS/ENERSHARE connector runtime
- contract negotiation and external dataspace publication
- production observability, retention, and incident response

## Local Pipeline Confirmation

The current pipeline remains:

```text
security-gateway
-> ingestion-api / DSO grid signal / approval / dataspace / audit routes
-> Kafka topics
-> engine
-> semantic-connector
-> ieee20305-translator
-> aggregator
-> approval-workflow
-> mock-dispatch-adapter
-> device-command-translator
-> Shelly / Enode / Heat Pump simulators
-> dataspace-export
```

No existing production-style service was removed.

Validation completed locally:

- `docker compose config`
- `docker compose config --services`
- full Node test suite for packages that define a test script
- PowerShell script syntax checks
- customer console lint, build, and client-boundary checks
- `scripts/run-full-demo-through-gateway.ps1`
- direct `/api/ingest` heat pump telemetry compatibility check

The pipeline continues to run locally through the security gateway with no real household device control. The live device command audit showed simulated Shelly Plug, Enode / Easee Core, and Heat Pump command translation with `no_real_execution: true`.
