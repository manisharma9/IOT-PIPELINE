# Customer Console Demo Validation Report

Date: 2026-06-15

## Summary

The Customer Operator Console was updated for a live client demo. The executive overview now reads live platform status through the security gateway and presents operational health, telemetry counts, simulator status, SLM-primary semantic mapping, Kafka topics, TimescaleDB storage, security audit activity, DSO/load-management state, mock dispatch, device command translation, and dataspace export status.

The browser still talks only to Next.js API routes. The Next.js API routes call the security gateway with the server-side edge API key. Internal service ports remain development-only and are not called from browser UI code.

## What Changed

- Added a live platform status API route to the security gateway: `GET /platform/status`.
- Added a Next.js proxy route: `GET /api/platform/status`.
- Reworked the Customer Console executive overview into a live operational dashboard.
- Added client-facing panels for services health, live pipeline flow, simulators, SLM semantic intelligence, security gateway insights, Kafka/storage insights, DSO/load management, dataspace export, and layered architecture.
- Added safe demo actions for refresh, SLM-primary sample, blocked security payload, and dataspace export sample.
- Fixed the SLM-primary smoke script so it waits for required reading names instead of only row count.
- Added a local runbook for the Customer Console.

## Dashboard Sections Added

- Executive pipeline status
- Services health
- Total telemetry processed
- Active simulators
- SLM primary status
- Kafka status and topics
- TimescaleDB status and record counts
- Security gateway audit insights
- Live pipeline flow with latest event times
- Device simulator insights for Shelly Plug, Enode/Easee EV charger, Heat Pump, grid sensor, and unknown valid telemetry
- SLM semantic intelligence panel showing Ollama, Phi-3 Mini, call counts, successful mappings, fallback counts, confidence, mapping source, and fallback reason
- DSO and load-management panel showing translator, aggregator, approval workflow, mock dispatch, and device command translator status
- Dataspace export foundation panel with minimized/pseudonymized export status
- Layered architecture panel for the client-facing technical walkthrough

## Data Sources Used

The dashboard uses these server-side routes:

- `GET /api/platform/status`
- `GET /api/health`
- `POST /api/security/blocked-test`
- `GET /api/security/audit`
- `POST /api/telemetry`
- `POST /api/dso/grid-signal`
- `GET /api/dispatch/proposals`
- `GET /api/approvals/proposals`
- `POST /api/approvals/review`
- `POST /api/approvals/approve`
- `POST /api/approvals/reject`
- `POST /api/approvals/mark-ready`
- `GET /api/mock-dispatch/audit`
- `GET /api/device-command/audit`
- `GET /api/dataspace/catalog`
- `GET /api/dataspace/export`

Those routes call the local security gateway and do not expose `EDGE_API_KEY` to browser code.

## Live Platform Snapshot

The live security gateway platform status endpoint returned:

- Pipeline status: `operational`
- Kafka status: `ok`
- Kafka topic count: `18`
- TimescaleDB status: `ok`
- Raw telemetry rows: `70`
- Semantic event rows: `136`
- Security gateway audit rows: `962`
- Dispatch command rows: `22`
- Device command audit rows: `29`
- Dataspace export audit rows: `32`
- SLM call count: `71`
- Successful SLM mappings: `50`
- Deterministic fallback count: `18`
- Active device insight rows: `5`
- Safety flag: `no_real_device_control = true`

## SLM Primary Evidence

The dedicated SLM-primary script passed against the live stack.

Evidence:

- Ollama reachable at `http://localhost:11434`
- `phi3:mini` installed and available
- Direct Phi-3 Mini JSON smoke prompt returned valid JSON
- Four live telemetry readings were sent through the security gateway:
  - Shelly Plug: `active_power_kw`
  - Enode/Easee EV charger: `ev_charging_power_kw`
  - Heat Pump: `roomHeat`
  - Grid sensor: `grid_stress_index`
- All four stored semantic rows used `mapping_source = slm_primary`
- All four recorded `slm_called = true`
- All four recorded `slm_model = phi3:mini`
- Forced unavailable-SLM check returned `mapping_source = deterministic_fallback` with `fallback_reason = slm_unavailable`

## Validation Results

| Check | Result |
| --- | --- |
| `docker compose config` | Passed |
| `docker compose config --services` | Passed |
| Full Node service test suite | Passed, 148 tests |
| Semantic connector tests | Passed, 30 tests |
| Security gateway tests | Passed, 20 tests |
| PowerShell script syntax checks | Passed, 7 scripts |
| `scripts/check-health.ps1` | Passed, all checked services healthy |
| `scripts/test-slm-primary.ps1` | Passed |
| `scripts/run-full-demo-through-gateway.ps1` | Passed |
| Customer console `npm install` | Passed, dependencies up to date |
| Customer console lint | Passed |
| Customer console production build | Passed |
| Customer console client-boundary check | Passed |
| Customer console browser smoke test | Passed |

## Full Gateway Demo Result

The production-style local demo ran through the security gateway.

Result summary:

- Gateway status: `ok`
- DSO grid signal: `accepted`
- Proposal created and moved through review, approval, and ready states
- Proposal ID used during validation: `86`
- Review status: `reviewed`
- Approval status: `approved`
- Ready status: `ready_to_dispatch`
- Mock dispatch audit rows returned: `5`
- Device command audit rows returned: `5`
- Dataspace export type: `full_pipeline_demo_summary`
- Dataspace record count: `100`
- `no_raw_private_payloads = true`
- Security gateway audit rows at demo completion: `948`

No real household device control occurred.

## Browser Smoke Test

The dashboard was started locally on `http://localhost:3000`.

Authenticated smoke test results:

- Login API returned HTTP `200`
- `/overview` returned HTTP `200`
- `/api/platform/status` returned live pipeline data
- Blocked security payload demo returned HTTP `403`, as expected
- Dataspace catalog returned `6` assets

Rendered browser checks passed at:

- Desktop: `1440 x 1000`
- Tablet: `900 x 1100`
- Mobile: `390 x 900`

The rendered page included:

- SLM semantic intelligence
- Phi-3 Mini status
- Device simulator insights
- Kafka and storage insights
- Security gateway insights
- DSO and load management
- Dataspace export
- No real device control safety badge

No horizontal overflow was detected in the tested responsive viewports.

## Local Run Command

Start the backend stack:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
```

Start the dashboard:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npm install
npm run dev
```

Dashboard URL:

```text
http://localhost:3000
```

Demo login:

Use the environment-configured demo account. Credentials are intentionally
not recorded in this report.

## Known Warnings

- Docker Compose prints a warning that the top-level `version` attribute is obsolete. The configuration still validates and runs.
- KafkaJS prints a default partitioner migration warning. It does not block local demo operation.
- The dashboard is a local development console. It does not represent an AWS deployment.
- Direct service ports are still exposed for development and testing, but the dashboard uses Next.js API routes and the security gateway.
- Dataspace export is an IDS/ENERSHARE-ready foundation only. It is not a certified ENERSHARE connector.
- IEEE 2030.5 payloads are compatible/style-oriented for the demo and are not certified IEEE 2030.5 compliance.
- Device actions remain simulated. No real Shelly, Enode, Easee, or household device control is performed.

## Remaining Improvements

- Add longer time-series charts once more historical telemetry is collected during demos.
- Add websocket or polling refresh for near-real-time dashboard updates.
- Add production identity integration later, such as Cognito, Auth0, or a JWT issuer.
- Add cloud deployment wiring later through the prepared AWS architecture.
- Add richer service-level logs and trace views once observability is connected.

## Demo Readiness Conclusion

The Customer Console is ready for the local client demo environment. It shows live validated platform status, SLM-primary semantic mapping evidence, storage counts, security gateway insights, load-management status, simulated device command translation, and dataspace export status without exposing internal service ports or secrets to the browser.
