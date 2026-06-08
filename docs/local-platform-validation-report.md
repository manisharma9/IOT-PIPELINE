# LOCAL PLATFORM VALIDATION REPORT

Validation date: 2026-06-07  
Repository: `C:\Users\Mani\Desktop\Github\IOT-PIPELINE`  
Branch validated: `customer-operator-console`  
Execution mode: local Docker Compose platform with local Ollama / Phi-3 Mini

## Executive Summary

The local AD-FLEX smart grid communication platform was validated end to end using the production-style local path:

External request -> security-gateway -> ingestion / DSO / approval / dataspace routes -> Kafka event pipeline -> TimescaleDB -> Customer Console API routes.

The platform is functioning correctly in the validated local environment. Evidence was collected from Docker health checks, Kafka topics, TimescaleDB rows, local Ollama model checks, live SLM-primary semantic rows, fallback tests, security tests, full gateway demo execution, Customer Console validation, and the full Node.js test suite.

One security inspection gap was found during live testing: a standalone `SELECT ... FROM` payload was not blocked by the DPI-style inspection rules. A narrow security-gateway rule and regression test were added. The updated gateway was rebuilt and revalidated successfully.

## Platform Overview

The validated platform contains:

- Security Gateway on port `3010`
- HTTP ingestion API on port `3001`
- MQTT broker and MQTT subscriber
- Apache Kafka digital spine
- Engine normalization service
- Semantic Connector with local Phi-3 Mini as the primary SLM mapping layer
- SAREF4ENER deterministic validation and fallback
- IEEE 2030.5-style translator
- Aggregator and approval workflow
- Mock dispatch adapter
- Device command translator
- Shelly Plug, Enode / Easee Core, and Heat Pump simulators
- Dataspace export foundation
- TimescaleDB / PostgreSQL storage
- Customer Operator Console running locally in Next.js

## Environment Used

- OS shell: Windows PowerShell
- Docker Compose: local Docker Desktop environment
- Kafka image: `confluentinc/cp-kafka:7.6.1`
- TimescaleDB image: `timescale/timescaledb:2.15.3-pg16`
- Ollama version: `0.30.5`
- Ollama endpoint: `http://localhost:11434`
- Local model confirmed: `phi3:mini`
- Customer Console: Next.js `16.2.6`

Ollama `/api/tags` confirmed both `phi3:mini` and `phi3:latest`. The `phi3:mini` model reports family `phi3`, parameter size `3.8B`, and quantization `Q4_0`.

## Services Started

The full Docker Compose stack was started and validated. The final container snapshot showed these services running:

| Container | Service | Status |
| --- | --- | --- |
| `adflex-zookeeper` | zookeeper | Up |
| `adflex-kafka` | kafka | Up, healthy |
| `adflex-timescaledb` | timescaledb | Up, healthy |
| `adflex-mqtt-broker` | mqtt-broker | Up |
| `adflex-ingestion-api` | ingestion-api | Up |
| `adflex-mqtt-subscriber` | mqtt-subscriber | Up |
| `adflex-engine` | engine | Up |
| `adflex-semantic-connector` | semantic-connector | Up |
| `adflex-ieee20305-translator` | ieee20305-translator | Up |
| `adflex-aggregator` | aggregator | Up |
| `adflex-approval-workflow` | approval-workflow | Up |
| `adflex-mock-dispatch-adapter` | mock-dispatch-adapter | Up |
| `adflex-device-command-translator` | device-command-translator | Up |
| `adflex-dataspace-export` | dataspace-export | Up |
| `adflex-shelly-simulator` | shelly-simulator | Up |
| `adflex-enode-simulator` | enode-simulator | Up |
| `adflex-heat-pump-simulator` | heat-pump-simulator | Up |
| `adflex-security-gateway` | security-gateway | Up |

Health endpoint validation returned `ok` for:

- ingestion-api
- ieee20305-translator
- aggregator
- approval-workflow
- mock-dispatch-adapter
- dataspace-export
- shelly-simulator
- enode-simulator
- heat-pump-simulator
- device-command-translator
- security-gateway

Startup order was dependency-driven through Docker Compose:

1. Zookeeper, Kafka, TimescaleDB, MQTT broker
2. Ingestion, MQTT subscriber, engine, semantic connector
3. IEEE 2030.5 translator, aggregator, approval workflow, mock dispatch, device command translator, dataspace export
4. Simulators
5. Security gateway as the production-style external entry point

## Test Cases Executed

### Platform and Configuration

- `docker compose config`
- `docker compose config --services`
- `scripts/check-health.ps1`
- `docker compose ps`
- Kafka topic list through the Kafka container
- TimescaleDB table row-count queries

Result: passed. Docker Compose still emits a warning that the top-level `version` field is obsolete.

### End-to-End Gateway Demo

Command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
```

Result:

```json
{
  "gateway_status": "ok",
  "dso_status": "accepted",
  "proposal_id": "85",
  "review_status": "reviewed",
  "approve_status": "approved",
  "ready_status": "ready_to_dispatch",
  "mock_audit_rows": 5,
  "device_command_audit_rows": 5,
  "dataspace_export_type": "full_pipeline_demo_summary",
  "dataspace_record_count": 100,
  "no_raw_private_payloads": true,
  "security_gateway_audit_rows": 921
}
```

Safety result: no real device control occurred. Device actions remained simulated only.

### Kafka Topics

Kafka topic evidence:

```text
dataspace.catalog
dataspace.export.audit
device.command.audit
device.command.result
dispatch.approval.audit
dispatch.command.audit
dispatch.command.mock.result
dispatch.command.mock.sent
dispatch.command.proposed
dispatch.command.ready
dispatch.mock.audit
grid.signals
ieee20305.translated
normalized.telemetry
raw.telemetry
security.gateway.audit
semantic.enriched
```

### Database Evidence

Final TimescaleDB row counts:

| Table | Rows |
| --- | ---: |
| `raw_telemetry` | 61 |
| `normalized_telemetry` | 120 |
| `semantic_events` | 123 |
| `ieee20305_events` | 129 |
| `dispatch_commands` | 21 |
| `dispatch_approval_audit` | 48 |
| `dispatch_execution_audit` | 16 |
| `device_command_audit` | 26 |
| `dataspace_exports` | 31 |
| `security_gateway_audit` | 921 |
| `processing_errors` | 0 |

The `processing_errors` count was `0`.

## SLM Validation

### Ollama and Phi-3 Mini

Ollama was reachable at:

```text
http://localhost:11434
```

`ollama list` confirmed:

```text
phi3:mini
phi3:latest
```

A direct Ollama `/api/generate` JSON smoke prompt returned a valid semantic JSON object for `grid_stress_index`, including:

```json
{
  "saref_type": "saref:Measurement",
  "saref_property": "saref:Property",
  "saref_unit": "unit:UNITLESS",
  "saref4ener_concept": "saref4ener:GridConditionIndicator",
  "ngsi_type": "Property",
  "ngsi_property": "gridStressIndex",
  "mapping_confidence": "medium"
}
```

### Runtime SLM-Primary Evidence

Live telemetry was sent through the security gateway for:

- Shelly Plug
- Enode / Easee EV charger
- Heat Pump
- Unknown grid sensor

TimescaleDB `semantic_events` evidence:

| Reading | Device | Device Type | Mapping Source | Confidence | Model | SLM Called | Fallback Reason | Deterministic Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `active_power_kw` | `shelly-plug-001` | `shelly_plug` | `slm_primary` | high | `phi3:mini` | true | empty | passed |
| `ev_charging_power_kw` | `easee-core-001` | `ev_charger` | `slm_primary` | high | `phi3:mini` | true | empty | passed |
| `roomHeat` | `heat-pump-001` | `heat_pump` | `slm_primary` | medium | `phi3:mini` | true | empty | not_available |
| `grid_stress_index` | `grid-sensor-001` | `grid_sensor` | `slm_primary` | medium | `phi3:mini` | true | empty | not_available |

This proves that the semantic connector called local Phi-3 Mini and stored `mapping_source = slm_primary` in live semantic rows.

## Fallback Validation

Fallback was validated by injecting an unavailable SLM mapper into the semantic connector mapping path.

Observed fallback result:

```json
{
  "mapping_source": "deterministic_fallback",
  "mapping_confidence": "high",
  "slm_called": true,
  "slm_model": "phi3:mini",
  "slm_confidence": null,
  "fallback_reason": "slm_unavailable",
  "deterministic_validation": "fallback_used",
  "validation_source": "deterministic_fallback"
}
```

Result: fallback works. The deterministic SAREF4ENER path remains available and the semantic connector does not crash when SLM output is unavailable.

## Security Validation

Live gateway security checks passed for:

- Health endpoint without API key
- Valid API key accepted
- Missing API key rejected with `401`
- Invalid API key rejected with `401`
- Invalid content type rejected with `415`
- SQL injection-like payload blocked with `403`
- Standalone `SELECT ... FROM` payload blocked with `403`
- XSS-like payload blocked with `403`
- Path traversal-like payload blocked with `403`
- Rate limiting returned `429` during a protected-route burst
- Correlation IDs were returned and forwarded
- Security audit endpoint returned sanitized audit metadata

Security audit evidence from the last two hours:

| Decision | Reason | Status | Count |
| --- | --- | ---: | ---: |
| accepted | security_audit_read | 200 | 152 |
| accepted | request_forwarded | 200 | 145 |
| accepted | edge_health | 200 | 141 |
| unauthorized | invalid_edge_api_key | 401 | 138 |
| blocked | unknown_route | 404 | 120 |
| rate_limited | rate_limit_exceeded | 429 | 32 |
| blocked | sql_injection_like_payload | 403 | 6 |
| blocked | json_content_type_required | 415 | 3 |
| unauthorized | missing_edge_api_key | 401 | 3 |
| blocked | path_traversal_like_payload | 403 | 2 |
| blocked | xss_like_payload | 403 | 1 |

Fix applied during validation:

- Added a narrow SQL DPI pattern for standalone `SELECT ... FROM`.
- Added a regression test in `services/security-gateway/test/index.test.js`.
- Rebuilt `security-gateway`.
- Revalidated blocked payload behavior and full gateway demo.

No raw request bodies or secrets are stored in gateway audit rows.

## Database Validation

Database validation confirmed:

- Raw telemetry rows exist.
- Normalized telemetry rows exist.
- Semantic rows exist, including live `slm_primary` rows.
- IEEE 2030.5-style event rows exist.
- Dispatch proposal rows exist.
- Approval audit rows exist.
- Mock execution audit rows exist.
- Device command audit rows exist.
- Dataspace export audit rows exist.
- Security gateway audit rows exist.
- Processing error table count is `0`.

Mock dispatch safety evidence:

| Simulation Status | Execution Mode | No Real Execution | Count |
| --- | --- | --- | ---: |
| `simulated_success` | `mock` | true | 15 |
| `rejected_invalid_ready_event` | `mock` | true | 1 |

## Dashboard Validation

Customer Console validation covered:

- Login page
- Demo operator login
- Session cookie in local dev mode
- Overview page
- Architecture page
- Security page
- Telemetry page
- Semantic page
- IEEE 2030.5 page
- DSO page
- Dispatch page
- Mock dispatch page
- Device command page
- Dataspace page
- AWS readiness page
- Runbook page
- Next.js API route to gateway health
- Security blocked payload test
- Dispatch proposal API route
- Mock dispatch audit API route
- Device command audit API route
- Dataspace catalog API route
- Dataspace full pipeline export API route
- Security audit API route

Customer Console validation result:

- `npm run build`: passed.
- `npm run lint`: passed.
- `npm run check:client-boundary`: passed.
- Local `npm run dev` authenticated dashboard validation: passed.
- All browser-facing calls stayed inside Next.js routes.
- Client boundary check confirmed no direct browser references to internal service ports `3001`, `3002`, `3003`, `3004`, `3005`, `3006`, or `3009`, and no client exposure of `EDGE_API_KEY`.

Screenshot capture was attempted through the in-app browser tool, but the browser runtime could not initialize in this environment. HTTP-level dashboard and API validation was completed instead.

Local production server note: `npm run start` serves the built console, but the local HTTP login test does not retain the secure session cookie because `NODE_ENV=production` marks the cookie `Secure`. For local validation, `npm run dev` is the supported mode. For deployed production, HTTPS is expected.

## Load Testing Results

A short stress run sent multiple telemetry events through the security gateway, including Shelly, Enode / Easee, Heat Pump, grid sensor, and unknown-device readings.

Stress evidence:

- Stress source rows present in `semantic_events`: 14
- Mapping distribution:
  - `slm_primary`: 10
  - `deterministic_fallback`: 3
  - `unmapped`: 1
- `processing_errors`: 0
- No container crashes observed.
- Kafka and TimescaleDB remained healthy after the stress run.

Observation: rapid SLM-first telemetry bursts can create queue latency because each reading performs a local Phi-3 Mini call. Some stress rows used fallback when SLM calls were unavailable, rejected, or too slow. This is expected resilience behavior, but throughput tuning is recommended before production use.

## Test Suite Results

All Node.js package tests passed:

| Package | Result |
| --- | --- |
| `services/shelly-simulator` | passed |
| `services/aggregator` | passed |
| `services/approval-workflow` | passed |
| `services/dataspace-export` | passed |
| `services/heat-pump-simulator` | passed |
| `services/semantic-connector` | passed |
| `services/device-command-translator` | passed |
| `services/mock-dispatch-adapter` | passed |
| `services/engine` | passed |
| `services/security-gateway` | passed |
| `services/ieee20305-translator` | passed |
| `services/enode-simulator` | passed |
| `services/ingestion-api` | passed |

Additional checks:

- Customer Console lint: passed.
- Customer Console build: passed.
- Customer Console client boundary check: passed.
- PowerShell parser syntax check for all scripts: passed.
- `docker compose config`: passed with obsolete `version` warning.

## Issues Found

1. DPI inspection did not block standalone `SELECT ... FROM`.
   - Severity: medium.
   - Status: fixed and regression-tested.

2. Local SLM throughput is slower than deterministic mapping.
   - Severity: medium for scale, low for demo.
   - Evidence: stress run caused queue latency and some fallback behavior.
   - Status: documented as tuning requirement.

3. Docker Compose warns that the top-level `version` attribute is obsolete.
   - Severity: low.
   - Status: safe cleanup recommended.

4. Customer Console production start over plain HTTP does not keep the secure login cookie.
   - Severity: low for local demo, medium for deployment readiness.
   - Status: expected when using production secure cookies without HTTPS. Use `npm run dev` locally or deploy behind HTTPS.

5. In-app browser screenshot capture was unavailable because the browser runtime failed to initialize.
   - Severity: low.
   - Status: HTTP dashboard validation completed instead.

## Fixes Applied

Changed file:

- `services/security-gateway/src/security.js`
- `services/security-gateway/test/index.test.js`

Fix:

- Added DPI pattern for `SELECT ... FROM`.
- Added test coverage for the new blocked SQL payload.

Validation after fix:

- Security gateway tests passed.
- Live blocked payload returned `403`.
- Full gateway demo passed.

## Remaining Risks

- Local API key security is suitable for demo only.
- No production OAuth/OIDC/JWT authorizer is configured yet.
- No production mTLS is configured yet.
- No real AWS deployment has been performed.
- No real DSO, Shelly, Enode, Easee, or dataspace credentials are configured.
- No real household device control is implemented.
- Dataspace export is a foundation, not a certified ENERSHARE connector.
- IEEE 2030.5 translation is compatibility-style foundation work, not certification.
- Phi-3 Mini local inference latency should be benchmarked and tuned before production load.

## Client Readiness Assessment

| Category | Score | Explanation |
| --- | ---: | --- |
| Architecture | 9/10 | The local architecture is layered, gateway-first, event-driven, and matches the intended production-style sequence. AWS deployment is prepared conceptually but not executed. |
| Reliability | 8/10 | End-to-end flows, fallback behavior, and tests passed. SLM latency under burst load is the main reliability tuning area. |
| Semantic Intelligence | 9/10 | Phi-3 Mini is now proven as the primary semantic mapping path, with deterministic validation and fallback retained. |
| Security | 7/10 | Gateway authentication, rate limiting, DPI-style blocking, correlation IDs, and audit logs work locally. Production OAuth/OIDC, WAF, mTLS, and secret management remain future work. |
| Maintainability | 8/10 | Services are modular with focused tests and clear docs. Further observability and central configuration cleanup would improve operations. |
| Demonstration Readiness | 9/10 | The local demo, dashboard, dataspace export, mock dispatch, and device simulators are ready for a client-style walkthrough. |

## Findings and Recommendations

Findings:

- The local platform works end to end through the security gateway.
- Phi-3 Mini is actively used as the primary semantic mapping layer.
- Deterministic fallback remains operational.
- Security gateway auditing and blocking are functioning.
- Database persistence covers telemetry, semantics, grid events, dispatch, approvals, mock execution, device command translation, dataspace export, and security audit.
- No real device control occurred.

Recommendations:

- Remove the obsolete Docker Compose `version` attribute.
- Add production authentication through Cognito, Auth0, or another JWT issuer.
- Add production WAF, TLS/mTLS, and managed secrets before cloud deployment.
- Add metrics for SLM latency, fallback rate, Kafka lag, and database insert failures.
- Add SLM concurrency/queue tuning before higher-volume tests.
- Deploy Customer Console behind HTTPS for production-mode secure cookies.
- Preserve the no-real-execution safety boundary until real credentials, consent, authorization, and rollback controls exist.

## Final Conclusion

Is the local platform functioning correctly?

Yes. The complete local platform is functioning correctly for the validated production-style local environment.

Supporting evidence:

- All Docker services were running and health checks passed.
- Kafka topics existed and carried the expected pipeline events.
- TimescaleDB contained rows for every major pipeline stage.
- `processing_errors = 0`.
- Live telemetry produced `mapping_source = slm_primary` rows using `phi3:mini`.
- Fallback produced `mapping_source = deterministic_fallback` when SLM was unavailable.
- Security gateway accepted valid requests and rejected unauthorized, malformed, rate-limited, SQL-like, XSS-like, and path traversal-like requests.
- The full gateway demo completed through proposal, approval, ready, mock dispatch, device command audit, and dataspace export.
- Customer Console local dashboard pages and server-side gateway API routes validated successfully.
- Full Node.js test suite, frontend checks, and PowerShell syntax checks passed.

