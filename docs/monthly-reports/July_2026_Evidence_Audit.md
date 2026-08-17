# July 2026 Evidence Audit

**Project:** AD-FLEX Smart Home Energy Intelligence and Flexibility Platform  
**Client:** EnerShare  
**Audit period:** 1 July 2026 to 31 July 2026  
**Audit completed:** 13 August 2026  
**Primary evidence source:** Git history, supported by committed machine-readable results, implementation reports, test reports, screenshots, scripts, schemas, migrations, and source diffs

## 1. Audit Method

The repository was inspected from the last pre-July commit (`3d90ee6`, 15 June 2026) through every July commit on all visible branches. The review used commit dates as the primary implementation timeline. Internal timestamps in generated evidence were then checked to identify work executed before it was committed.

Claims in the July report will use these meanings:

| Classification | Meaning in this audit |
|---|---|
| Implemented | Source, configuration, schema, or documentation was added to Git during July. |
| Validated | A committed test report or machine-readable result records an executed check during July. |
| Demonstrated | A live local workflow or customer-facing experience was exercised and evidenced. |
| Planned | A design, workload, or roadmap was documented but the stated scale was not completed. |
| Future production architecture | A scale-out or deployment direction, not a completed local capability. |

## 2. Position Before July

The pre-July baseline was commit `3d90ee6e3ba2d2f76fb645785abba604ad08486a` dated 15 June 2026. It already contained the Phase 1-9 platform and therefore these capabilities must not be presented as new July achievements:

- HTTP and MQTT telemetry ingestion;
- Zookeeper, Kafka, and TimescaleDB/PostgreSQL;
- normalization engine and `raw.telemetry` / `normalized.telemetry` flow;
- local semantic connector, Phi-3 Mini/Ollama integration, SAREF4ENER mapping, and SLM-primary support;
- simplified IEEE 2030.5-style translator and DSO grid-signal endpoint;
- aggregator, approval workflow, mock dispatch, and audit tables;
- Shelly Plug, Enode/Easee charger, and heat-pump simulators;
- device-command translation and simulated provider APIs;
- privacy-aware dataspace export foundation;
- security gateway with audit controls;
- customer operator console and recorded dashboard walkthrough;
- migrations `001` through `009` and all 18 core Compose application/infrastructure services then present.

July work extended, measured, scaled, and productised this baseline rather than creating it from scratch.

## 3. July Commits Reviewed

| Date | Commit | Branch lineage | Subject | Scale of change |
|---|---|---|---|---:|
| 20 Jul 2026 | `3cc24f9` | `customer-operator-console` | Improve simulator telemetry and semantic consumer resilience | 24 files; 3,705 insertions; 39 deletions |
| 20 Jul 2026 | `2c9231f` | `slm-first-10000-device-scalability` | Update project implementation and configuration | 104 files; 26,360 insertions; 454 deletions |
| 24 Jul 2026 | `93c10c8` | `customer-facing-enershare-dashboard` | Implement IoT pipeline enhancements | 69 files; 8,020 insertions; 145 deletions |
| 26 Jul 2026 | `8ef7b65` | `customer-facing-enershare-dashboard` | Update project implementation across multiple components | 83 files; 5,230 insertions; 312 deletions |

These commits form one linear July sequence from the pre-July baseline.

## 4. Files Added During July

### Multi-household validation

- `scripts/run-multi-household-validation.js`
- `scripts/run-multi-household-validation.ps1`
- `scripts/build-multi-household-report.py`
- `services/shelly-simulator/test/multi-household-runner.test.js`
- `services/shelly-simulator/test/multi-household-simulator.test.js`
- `docs/multi-household-scalability-validation-report.md`
- `docs/multi-household-pipeline-validation-report.docx`
- `docs/demo-assets/multi-household-validation-results.json`
- three multi-household dashboard/semantic screenshots

### SLM scalability architecture and tooling

- `database/timescale/010_slm_scalability.sql`
- `schemas/slm-semantic-batch-response.schema.json`
- `services/semantic-connector/src/reading-batcher.js`
- `services/semantic-connector/src/batch-mapper.js`
- `services/semantic-connector/src/slm-batch-validation.js`
- `services/semantic-connector/src/outcome-builder.js`
- provider interface and Ollama/vLLM provider adapters under `services/semantic-connector/src/providers/`
- provider, batching, and strict-validation tests
- `scripts/run-scale-validation.js`, `scripts/run-scale-stage.js`, wrappers, sampler, provider benchmark, topic configuration, worker launcher, and evidence builder
- `config/scalability-10000.example.json`
- audit, batching, provider comparison, workload, validation-plan, limitations, and scale-out roadmap documents
- aggregate scalability page and platform device API in the customer console

### Customer-facing EnerShare product

- seven product routes under `/dashboard`;
- preserved internal route `/admin/operations`;
- customer BFF routes, product components, customer types, and route helpers;
- `database/timescale/011_customer_dashboard_read_model.sql`;
- security-gateway authorization, metrics, read-model, and validated-insight modules;
- customer authorization, metric, insight, product-boundary, and responsive tests;
- dashboard audit, architecture, metric definitions, security, user journeys, test report, implementation report, flexibility-score methodology, and demonstration script;
- desktop, tablet, and mobile customer dashboard screenshots.

### Household fleet and free public demonstration

- `services/household-fleet-simulator/` as one bounded fleet process;
- generalized household-device model with 13 categories;
- `database/timescale/012_simulated_device_registry.sql`;
- `config/household-fleet.example.json`;
- same-origin dashboard API routes and server-side device-detail routes;
- public-demo authentication hardening and login throttling;
- `docker-compose.public-demo.yml`;
- Cloudflare Quick Tunnel start, stop, and check scripts;
- household-device, fleet-simulator, public-demo architecture, security, runbook, and validation documents.

## 5. Files Significantly Modified During July

- `.env.example`, `docker-compose.yml`, and `readme.md` for new scale, fleet, semantic, dashboard, and public-demo configuration;
- shared `BaseDevice`, Shelly, Enode/Easee, and heat-pump simulator implementations;
- semantic connector entry point, database helper, semantic builder, Dockerfile, and test suite;
- engine publisher/database flow and IEEE translator database/translation logic for durable reading identity;
- security gateway routes, status queries, authorization, customer reads, and tests;
- customer-console layout, authentication, product pages, CSS, BFF helpers, scripts, and package configuration;
- final architecture and demo documents;
- start/stop/health scripts.

## 6. Features Implemented in July

### 6.1 Independent multi-household simulation

The original three simulator families were extended with seeded, independent state changes and richer telemetry. A five-household runner created 15 unique assets without one process per asset. Shelly emitted power, voltage, current, and cumulative energy; Enode/Easee emitted charging state, charging power, and delivered energy; heat pumps emitted power, temperatures, and operating mode.

### 6.2 Mandatory-SLM scalability foundations

The connector gained micro-batching, strict reading-ID reconciliation, provider abstraction, Ollama and vLLM-compatible adapters, retries, dead-letter handling, durable per-reading SLM audit evidence, worker/batch/request identity, consumer-lag metrics, and idempotent read identities. Deterministic SAREF4ENER logic was constrained to validation/rejection rather than silently manufacturing a replacement mapping in the scalable path.

### 6.3 Product and operations dashboard separation

The technical console was retained for technical administrators while a separate customer product was introduced. Product pages covered household overview, analytics, devices, flexibility, community, reports, and settings. A customer read layer in TimescaleDB and the security gateway performed bounded aggregation, pseudonymization, household isolation, and role-aware access. Browser calls remained behind Next.js server routes and the security gateway.

### 6.4 Validated AI energy insights

The customer-insight path used bounded aggregate facts, allowlisted insight categories, deterministic fact validation, and cached output. Normal customer pages omitted prompts, batch identifiers, model latency, token usage, and raw reasoning.

### 6.5 Multi-category household fleet

One bounded Node.js fleet service represented 20 mixed-profile households and 241 devices across 13 categories. It used one scheduler loop, bounded request concurrency, deterministic state, retryable pending envelopes, and a device registry. Existing Shelly, Enode/Easee, and heat-pump simulator APIs were preserved.

### 6.6 Public laptop demonstration boundary

A free Cloudflare Quick Tunnel workflow exposed only the Next.js customer dashboard. Docker service ports were kept loopback-bound in the public-demo profile. Same-origin server routes, signed HTTP-only sessions, rate-limited login, and environment-only credentials protected the demonstration. The temporary tunnel was explicitly documented as having no production SLA.

## 7. Validation Evidence

### 7.1 Five-household end-to-end run, 20 July

Source: `docs/multi-household-scalability-validation-report.md` and `docs/demo-assets/multi-household-validation-results.json`.

| Measure | Result |
|---|---:|
| Households / devices | 5 / 15 |
| Telemetry messages | 30 accepted of 30 |
| Normalized readings | 120 |
| Semantic / IEEE-style terminal rows | 120 / 120 |
| SLM calls | 120 (100%) |
| `slm_primary` | 80 |
| Deterministic fallback under the then-current policy | 10 |
| Safely unmapped | 30 |
| Drops / semantic duplicates / IEEE duplicates / processing errors | 0 / 0 / 0 / 0 |
| Gateway average / p95 latency | 13.04 / 14.87 ms |
| End-to-end completion | 100% |

The full DSO, approval, mock dispatch, simulated device-command, and minimized dataspace-export path also completed with `no_real_execution=true`.

### 7.2 First mandatory-SLM scale gate, 20 July

Source: `docs/scalability-results/scalability-validation-results.json` committed in `2c9231f`.

The 100-device stage failed its capacity/evidence gate: 400 normalized readings were produced, only 344 had completed SLM audit evidence (86%), final Kafka lag remained 112, and completion throughput was 0.276 readings/s against 6.664 readings/s arrival. The planned 1,000-, 5,000-, and 10,000-device stages were not run. The generator represented a 10,000-device population in memory, but this was not an end-to-end validation.

Direct local Phi-3 Mini provider benchmarks measured approximately 0.294 readings/s at batch 1, 0.616 readings/s at batch 4, and 0.601 readings/s at batch 8. Validation failures in larger samples exposed structured-output quality gaps.

### 7.3 Customer dashboard validation, 24 July

Source: `docs/customer-dashboard-testing-report.md`.

- 184 service tests, 5 root generator tests, and 4 product-boundary tests passed;
- security-gateway tests: 39 passed;
- semantic-connector tests: 41 passed;
- lint and production build passed, generating 54 routes;
- 12 PowerShell scripts parsed successfully;
- all 18 Compose services were present;
- live household data returned three devices, 6.19 kW current power, and 1.55 kWh estimated daily energy;
- 13 fresh semantic attempts all recorded `slm_called=true`, with 7 accepted and 6 safely unmapped;
- the full gateway workflow completed through proposal 97, ready-to-dispatch, mock/device audit, and a 100-record minimized dataspace export;
- desktop, tablet, and 320-pixel mobile routes passed without horizontal overflow.

### 7.4 Household fleet and public demo validation, 24-26 July

Source: `docs/public-demo-validation-report.md` and `docs/household-fleet-simulator.md`.

| Measure | Result |
|---|---:|
| Households / devices | 20 / 241 |
| Average devices per household | 12.05 |
| Device categories | 13 of 13 |
| Telemetry generated / accepted | 3,436 / 3,436 |
| Delivery retries / drops | 6 / 0 |
| Normalized fleet readings | 14,207 |
| Devices reaching raw and normalized storage | 241 / 241 |
| Completed SLM audit rows | 3,041, all with `slm_called=true` |
| Strict mappings / safely unmapped | 1 / 3,040 |

The fleet, normalization, customer read model, DSO workflow, simulated command path, dataspace export, authentication, responsive UI, and temporary public tunnel passed. However, the single Phi-3 Mini worker did not provide acceptable semantic quality or throughput for the continuously running 241-device stream. This is a demonstrated limitation, not a full semantic-completion claim.

### 7.5 Late-July 1,000-asset evidence committed in August

Machine-generated run artifacts now in the repository record staged executions on 27 July for 100, 250, 500, and 1,000 assets. The final late-July functional run represented 100 households and 1,000 assets, recorded 100% SLM invocation, 969 validated mappings, 31 safely-unmapped outcomes, zero duplicate final rows, zero processing errors, and final Kafka lag zero. It was an asynchronous functional pass: completion was 0.424 readings/s against 1.666 readings/s arrival.

These artifacts were not added to Git until commit `f0bd3a1` on 5 August. The July report may present them as **late-July executed evidence subsequently versioned in August**, but must not describe the August code consolidation or 5 August sustained validation as a July achievement.

## 8. Documentation Created During July

The month produced evidence and design documents for multi-household validation, SLM batching, provider abstraction, scalability limits, 10,000-device workload planning, million-device architecture roadmap, customer metrics, authorization, AI insights, fleet simulation, public-demo security, and public laptop operation. The 10,000- and million-device documents are planning/architecture artifacts, not capacity validations.

## 9. Screenshots and Visual Evidence Available

- `docs/demo-assets/multi-household-dashboard-overview.png`
- `docs/demo-assets/multi-household-dashboard.png`
- `docs/demo-assets/multi-household-semantic-outcomes.png`
- `docs/demo-assets/customer-dashboard-desktop.png`
- `docs/demo-assets/customer-dashboard-tablet.png`
- `docs/demo-assets/customer-dashboard-mobile.png`
- `docs/scalability-results/dashboard-scalability-evidence.png`
- `docs/scalability-results/dashboard-scalability-mobile-evidence.png`
- `docs/scalability-results/scalability-validation-charts.png`

The first customer-dashboard images were created on 24 July and updated during the 26 July public-demo work. They are suitable as July end-state evidence when captioned accordingly.

## 10. Problems and Resolutions Evidenced in July

| Challenge | Evidence-based resolution | Result |
|---|---|---|
| Kafka consumer session expired during long local SLM inference | Increased semantic session timeout and enforced margin over SLM timeout | Final five-household run had zero duplicate semantic/IEEE rows |
| Customer console exposed engineering detail | Added product routes, role-aware read model, and `/admin/operations` separation | Customer pages passed terminology and access-boundary tests |
| Initial fleet request burst exceeded gateway rate budget | Distributed initial emissions and added bounded retry handling | 3,436 of 3,436 generated messages accepted; zero drops |
| Local Phi-3 output quality/throughput degraded under fleet load | Strict rejection, safe-unmapped outcomes, explicit reporting, and provider/microbatch architecture | No fabricated mappings, but semantic throughput remained unresolved |
| Public demo risked exposing internal routes or credentials | Same-origin BFF, signed session, loopback bindings, public-mode route restrictions | Quick Tunnel exposed only the customer application in validation |

## 11. Unresolved Ambiguity and Resolution

1. **Late-July runs, August commit:** stage files are timestamped 27 July but first appear in Git on 5 August. Resolution: execution evidence is acknowledged in July with an explicit provenance caveat; formal implementation consolidation and August-only revalidation remain in the August report.
2. **SLM policy evolution:** the 20 July five-household report still records ten `deterministic_fallback` mappings. Later July scalable semantics prohibited deterministic replacement and used safe-unmapped outcomes. Resolution: the report describes this as an in-month policy evolution, not one uniform monthly state.
3. **10,000-device wording:** the generator could represent 10,000 virtual devices, while the end-to-end 100-device gate failed and later stages did not run. Resolution: only generator/population representation and architecture preparation are marked implemented; 10,000-device processing is marked unvalidated.
4. **Public demo semantic result:** all completed SLM rows were audited, but almost all failed strict validation and backlog remained. Resolution: ingestion/product/public-access success is separated from semantic-capacity success.

## 12. July End-State Summary

By 31 July, available evidence shows a materially expanded local platform: multi-household simulation, mandatory-SLM batching and provider foundations, role-isolated customer product views, a 13-category bounded fleet, and a protected laptop-hosted public demonstration path. Live runs proved full workflow integrity at 15 devices and delivery/read-model operation at 241 devices. Late-July artifacts also record an asynchronous functional pass at exactly 1,000 assets, though that implementation and its evidence were not committed until August. Local Phi-3 Mini inference remained the principal throughput and output-quality constraint.

