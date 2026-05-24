#  Device API Translation Report

This report explains the device API translation alignment added after Phase 9. It is not Phase 10 and does not add real device control.

## Why This Alignment Was Needed

Paolo clarified that the final scope needs more than a one-way data pipeline. The system must show bidirectional load management:

1. A DSO request enters the system and is translated into grid and dispatch concepts.
2. A human-reviewed approval workflow marks a proposal ready.
3. The approved command is translated back into the API language of end devices.

The added work keeps the Phase 1 to Phase 9 pipeline intact and adds only a safe, simulated device API translation layer.



The clarified scope has four parts:

- Semantic Connector: already covered by deterministic SAREF4ENER mapping and optional SLM-assisted mapping for unknown readings.
- DSO Protocol Translation: already covered by the IEEE 2030.5-style translator foundation. No SLM is used there.
- Load Management: now extended with approved ready command translation into device-specific API commands.
- Hardware and Integration Focus: now focused on simulated Shelly Plug and simulated Enode / Easee Core charger APIs.

No real credentials are used. No real household device is controlled.

## What Was Added

- A simulated device registry for Shelly Plug and Enode / Easee Core.
- A Shelly Plug simulator service.
- An Enode / Easee Core charger simulator service.
- A device command translator service.
- A TimescaleDB audit table for simulated device command translation.
- Kafka topics for device command results and audit events.
- Examples, tests, runbook updates, and final documentation updates.

## Shelly Simulator

The Shelly simulator is a local Node.js and Express service. It exposes:

- `GET /health`
- `GET /shelly/status`
- `POST /shelly/plug/command`

It accepts:

- `turn_off`
- `turn_on`
- `reduce_load`
- `restore_load`

Every response includes:

- `simulated: true`
- `no_real_execution: true`

## Enode / Easee Simulator

The Enode simulator is a local Node.js and Express service. It exposes:

- `GET /health`
- `GET /enode/chargers`
- `POST /enode/chargers/:chargerId/command`

It accepts:

- `pause_charging`
- `resume_charging`
- `reduce_charging_power`
- `restore_charging_power`

Every response includes:

- `provider: enode`
- `charger_type: easee_core`
- `simulated: true`
- `no_real_execution: true`

## Device Command Translator

The translator consumes `dispatch.command.ready` after approval. It validates that the ready event contains:

- `status: ready_to_dispatch`
- `no_execution: true`
- `execution_blocked: true`

It then selects simulated devices from the registry, allocates the requested load reduction, translates the request into each device API language, calls the local simulator endpoints, writes audit rows, and publishes Kafka events.

Output topics:

- `device.command.result`
- `device.command.audit`

Database table:

- `device_command_audit`

## Bidirectional Flow

```text
DSO grid signal
-> ieee20305-translator
-> grid.signals
-> aggregator
-> dispatch.command.proposed
-> approval-workflow
-> dispatch.command.ready
-> device-command-translator
-> Shelly Plug simulator / Enode Easee Core simulator
-> device.command.result
-> device.command.audit
-> device_command_audit
```

This is bidirectional because the grid request flows into the platform, then the approved command is translated outward toward device APIs. In this project those APIs are local simulators only.

## How To Run

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo.ps1
```

Check the simulated device command audit:

```powershell
Invoke-RestMethod http://localhost:3009/device-command/audit?limit=5
```

Check simulator status:

```powershell
Invoke-RestMethod http://localhost:3007/shelly/status
Invoke-RestMethod http://localhost:3008/enode/chargers
```

## How To Test

Run Docker Compose validation:

```powershell
docker compose config
docker compose config --services
```

Run Node tests:

```powershell
node --test services/shelly-simulator/test/*.test.js
node --test services/enode-simulator/test/*.test.js
node --test services/device-command-translator/test/*.test.js
```

Run the full local test suite if dependencies are installed:

```powershell
$tests = Get-ChildItem -Recurse -Filter *.test.js services | ForEach-Object { $_.FullName }
node --test $tests
```

## Limitations

- Simulated device APIs only.
- No real Shelly credentials.
- No real Enode credentials.
- No real Easee Core charger control.
- No real household dispatch.
- No production mTLS or OAuth/OIDC.
- No certified IEEE 2030.5 implementation.
- No certified ENERSHARE connector.
- Simple rule-based allocation only.

## Future Production Work

Production work would need real device enrollment, consent, secure credentials, real provider sandboxes, operator authorization, production identity, mTLS, rate limits, signed audit logs, and careful safety testing.

The next sensible step would be a controlled sandbox integration with fake provider credentials, still separated from real customer devices.
