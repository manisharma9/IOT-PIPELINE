# Multi-Household Scalability Validation Report

**Validation date:** 20 July 2026  
**Final run ID:** `mh-20260720071954`  
**Scope:** Production-style local scalability demonstration, not a maximum-capacity benchmark

## Executive Summary

AD-FLEX successfully processed a realistic five-household workload containing 15 independently simulated energy assets. Each household contained a Shelly Plug, an Enode / Easee EV charger, and a heat pump. Every device used a unique identifier, an independent update interval, changing telemetry values, and distinct timestamps.

The final measured run generated two telemetry updates per device: 30 gateway requests and 120 normalized energy readings. All 30 requests were accepted, all 120 readings reached semantic and IEEE 2030.5-style storage, no readings were dropped, no duplicate semantic or IEEE rows were created, and no processing errors were recorded. The observed completion rate was 100%.

Local Phi-3 Mini was called for all 120 readings. Eighty outputs passed semantic guardrails as `slm_primary`; ten known readings used `deterministic_fallback`; and thirty readings were stored as safely `unmapped` because the local model output did not pass unit, concept, property, or confidence validation. Guardrail rejection did not stop the pipeline.

The DSO path also completed: a grid signal created proposal 89, the proposal moved through reviewed, approved, and ready-to-dispatch states, one mock dispatch audit row and three simulated device command audit rows were stored, and the dataspace export returned a minimized, pseudonymized summary. Both dispatch layers retained `no_real_execution = true`.

## What Was Added

- Extended the shared simulator contract with seeded independent behavior and elapsed-time helpers.
- Added realistic Shelly voltage, current, and cumulative energy telemetry.
- Added EV charging state and cumulative delivered energy telemetry.
- Added heat-pump target temperature and operating-mode telemetry.
- Added a reusable five-household validation runner and PowerShell wrapper.
- Added simulator and validation-runner regression tests.
- Increased the semantic Kafka consumer session window so a local SLM timeout cannot force offset redelivery.
- Added duplicate-aware runtime accounting for semantic and IEEE records.
- Updated gateway device insights to return the latest 20 devices, ordered by processing time.
- Added a Playwright dashboard smoke test and a visual evidence screenshot.
- Corrected the Mosquitto Compose bind path to the configuration file present in the repository.

## Test Configuration

| Item | Configuration |
| --- | --- |
| Households | 5 |
| Devices | 15 total, 3 per household |
| Device mix | 5 Shelly Plugs, 5 Enode / Easee EV chargers, 5 heat pumps |
| Updates | 2 per device |
| Telemetry messages | 30 |
| Normalized readings | 120 |
| Update interval range | 322-1,382 ms |
| Ingress route | `POST http://localhost:3010/telemetry` |
| Authentication | Local edge API key through security gateway |
| Semantic model | Local Ollama `phi3:mini` |
| Semantic policy | SLM primary, deterministic SAREF4ENER validation/fallback |
| Storage | Local PostgreSQL/TimescaleDB |
| Dispatch mode | Mock only; no real execution |
| Dataspace mode | Minimized and pseudonymized local export foundation |

All 15 devices produced two different telemetry samples and two ordered, unique timestamps. The generated values remained within the simulator's electrical, charging, and thermal ranges.

## End-To-End Procedure

1. Built and started all 18 Docker Compose services.
2. Confirmed Kafka and TimescaleDB health and checked all exposed service health endpoints.
3. Confirmed Ollama was reachable and `phi3:mini` was installed.
4. Created five households with one instance of each supported simulator type.
5. Submitted 30 independently timed telemetry payloads through the security gateway.
6. Waited for 120 unique semantic and 120 unique IEEE 2030.5-style rows.
7. Submitted a DSO curtailment signal and moved its proposal through review, approval, and ready status.
8. Verified mock dispatch and simulated Shelly, Enode / Easee, and heat-pump command audit rows.
9. Requested the full pipeline dataspace summary and verified minimization and pseudonymization flags.
10. Published a separate telemetry file through MQTT and verified raw, normalized, semantic, and IEEE persistence.
11. Opened the customer console with Playwright and verified final-run device IDs, Phi-3 primary status, safety messaging, and desktop/mobile rendering.
12. Reran the existing gateway demo to confirm backward compatibility.

## Runtime Results

### Delivery And Storage

| Metric | Result |
| --- | ---: |
| Telemetry messages generated | 30 |
| Gateway messages accepted | 30 |
| Raw telemetry rows | 30 |
| Normalized readings | 120 |
| Semantic rows | 120 |
| Unique semantic readings | 120 |
| IEEE 2030.5-style rows | 120 |
| Unique IEEE readings | 120 |
| Semantic duplicate rows | 0 |
| IEEE duplicate rows | 0 |
| Dropped messages | 0 |
| Dropped readings | 0 |
| Processing errors | 0 |
| Overall completion rate | 100% |

### Latency And Throughput

| Metric | Minimum | Average | Maximum | Notes |
| --- | ---: | ---: | ---: | --- |
| Gateway response | 10.56 ms | 13.04 ms | 17.30 ms | P95: 14.87 ms |
| Raw database insert | 7.08 ms | 10.02 ms | 18.92 ms | Event timestamp to raw receipt |
| Semantic queue-to-persist | 2.22 s | 112.86 s | 222.26 s | Includes waiting behind serial local SLM inference |
| Full pipeline queue-to-IEEE | 2.24 s | 112.87 s | 222.26 s | Raw receipt to IEEE persistence |

The input burst was accepted at approximately 7.143 telemetry messages per second. The observed end-to-end completion rate was 0.133 telemetry messages per second and 0.531 normalized readings per second. These figures describe this local Phi-3 execution path and are not Kafka capacity limits.

The complete measured workflow, including DSO, dispatch, device translation, dataspace export, and evidence collection, ran for 233.4 seconds.

### Semantic Intelligence

| Mapping outcome | Count | Share |
| --- | ---: | ---: |
| SLM calls | 120 | 100% of readings |
| `slm_primary` | 80 | 66.7% |
| `deterministic_fallback` | 10 | 8.3% |
| `unmapped` after guardrail rejection | 30 | 25.0% |

Confidence distribution:

| Source | Confidence | Count |
| --- | --- | ---: |
| `slm_primary` | high | 53 |
| `slm_primary` | medium | 27 |
| `deterministic_fallback` | high | 10 |
| `unmapped` | low | 30 |

By device type, Shelly readings produced 30 SLM-primary and 10 deterministic-fallback mappings. EV charger readings produced 13 SLM-primary and 17 safely unmapped results. Heat-pump readings produced 37 SLM-primary and 13 safely unmapped results. The unmapped results were primarily state-code or less-established thermal semantics that did not satisfy the configured guardrails.

### DSO, Dispatch, And Dataspace Evidence

| Evidence | Result |
| --- | --- |
| DSO signal | Accepted |
| Dispatch proposal | ID 89 |
| Final proposal status | `ready_to_dispatch` |
| Approval audit rows | 3 |
| Mock dispatch rows | 1 |
| Simulated device command rows | 3 |
| Real execution | Disabled |
| Dataspace export | `full_pipeline_demo_summary` |
| Export record count | 100 |
| Minimization applied | Yes |
| Pseudonymization applied | Yes |
| Raw private payloads exposed | No |

The measured validation window also created 35 gateway security audit rows, one dispatch row, three approval rows, one mock dispatch row, three device-command rows, and one dataspace export audit row.

### Resource Snapshot

Docker resource snapshots were collected before and after the run. They are point-in-time readings, not peak measurements.

| Component | CPU after run | Memory after run |
| --- | ---: | ---: |
| Kafka | 0.86% | 571 MiB |
| TimescaleDB | 0.02% | 99.29 MiB |
| Zookeeper | 0.22% | 176.8 MiB |
| Semantic connector | 2.24% | 37.75 MiB |
| Security gateway | 2.04% | 29.93 MiB |
| Highest sampled application CPU | 2.35% | Dataspace export |

All 18 containers were running with zero restarts at the final check. No final-run error entries were found in the container log scan.

## Pipeline Observations

### Security Gateway

Accepted all 30 authenticated telemetry requests and issued correlation IDs. Average response time was 13.04 ms. Run-specific security decisions were persisted without storing raw request bodies.

### Ingestion, Kafka, And Engine

The ingestion API published every message to `raw.telemetry`. Kafka delivered all messages, and the engine expanded the device payloads into exactly 120 normalized readings. A separate MQTT probe produced one raw row and four records at each downstream reading stage.

### Semantic Connector And Phi-3 Mini

Ollama and `phi3:mini` were available during the run. The connector called the model for every reading, validated each result against schema and SAREF4ENER guardrails, and persisted every outcome. The local model was the main throughput constraint because readings were processed serially.

### TimescaleDB

Run-specific historical queries returned all five households and all fifteen devices. Raw, normalized, semantic, IEEE, approval, dispatch, device-command, gateway-audit, and dataspace records were queryable. No failed insert was observed.

### IEEE 2030.5-Style Translation

All 120 semantic events reached `ieee20305_events`. This remains a simplified translator foundation using MirrorMeterReading/DERStatus-style resources and does not claim certified IEEE 2030.5 compliance.

### Approval And Dispatch

The proposal followed only allowed transitions: proposed to reviewed, reviewed to approved, and approved to ready-to-dispatch. Mock dispatch and device-specific translation completed with `no_real_execution = true`.

### Customer Console

The dashboard showed the live pipeline, Phi-3 Mini availability, SLM-primary status, storage counts, security audit data, DSO/dispatch evidence, and final-run device IDs. The 390-pixel mobile check had no horizontal overflow. The only browser warning was a missing optional `favicon.ico`; no JavaScript or page errors occurred.

### Dataspace Export

The full pipeline summary returned 100 minimized records with pseudonymization enabled and no raw private payloads. This remains an IDS/ENERSHARE-ready foundation, not a certified external connector.

## Finding And Fix Applied

An initial diagnostic run created one duplicate semantic/IEEE row. The first local model request reached the 30-second SLM timeout, exceeded KafkaJS's default consumer session, and caused a group rejoin and offset redelivery.

The semantic consumer now uses `SEMANTIC_KAFKA_SESSION_TIMEOUT_MS=120000` and enforces a session at least 30 seconds longer than the configured SLM timeout. Regression tests cover the timing rule. The final 120-reading run produced zero duplicate semantic or IEEE rows and no coordinator errors.

## Scalability Assessment

The architecture handled the intended five-household, fifteen-device production-style demonstration successfully. Concurrent ingress, Kafka delivery, normalization, storage, protocol translation, approval, mock dispatch, device API translation, dataspace export, and dashboard visibility remained operational.

The principal bottleneck is local serial Phi-3 inference. Gateway, Kafka, engine, database, and application container resource samples remained modest, while semantic queue latency grew as 120 readings waited behind one local model consumer. Larger tests should introduce bounded semantic concurrency, partition-aware consumers, model warm-up, and explicit per-inference latency telemetry before increasing household count substantially.

## Limitations

- This was a controlled local demonstration, not a maximum-throughput benchmark.
- Phi-3 ran locally on one workstation; hardware-specific results will vary.
- CPU and memory figures are point-in-time Docker samples, not peak profiles.
- Thirty readings were safely unmapped; state-code and additional thermal mappings need future ontology coverage.
- The IEEE translator is a simplified foundation, not a certified implementation.
- Dataspace export is a local IDS/ENERSHARE-ready foundation without production contract negotiation or credentials.
- Dispatch and device API calls remain simulated. No household device was controlled.
- Production identity, mTLS, secrets management, high availability, backups, and cloud deployment remain future work.

## Reproduce The Validation

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-multi-household-validation.ps1 -Households 5 -Cycles 2

cd .\apps\customer-console
npm run build
npm run start
# In another PowerShell window:
npm run smoke:multi-household
```

## Evidence Artifacts

- Machine-readable results: `docs/demo-assets/multi-household-validation-results.json`
- Dashboard screenshot: `docs/demo-assets/multi-household-dashboard.png`
- Business and technical Word report: `docs/multi-household-pipeline-validation-report.docx`
- Reusable validation runner: `scripts/run-multi-household-validation.js`
- PowerShell wrapper: `scripts/run-multi-household-validation.ps1`

## Conclusion

The AD-FLEX local pipeline successfully supported five simultaneously represented households and fifteen independently simulated energy devices. The final two-update-per-device run completed with 100% unique end-to-end delivery, no dropped messages, no duplicate semantic or IEEE records, no processing failures, real local Phi-3 primary mapping, safe deterministic fallback, successful mock-only load management, and a minimized dataspace export.

The architecture is ready for larger controlled local testing. The next scalability step should focus on semantic inference concurrency and richer deterministic coverage for device state and operating-mode readings before increasing workload size.
