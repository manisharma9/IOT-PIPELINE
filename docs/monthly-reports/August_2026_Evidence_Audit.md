# August 2026 Evidence Audit

**Project:** AD-FLEX Smart Home Energy Intelligence and Flexibility Platform  
**Client:** EnerShare  
**Audit period:** 1 August 2026 to 13 August 2026  
**Audit completed:** 13 August 2026  
**Primary evidence source:** Git history, supported by committed machine-readable results, source/configuration diffs, validation reports, screenshots, charts, and test inventories

## 1. Audit Method

The August audit began from July's final committed revision, `8ef7b65` (26 July 2026), and reviewed every commit from 1 August through the current date. Git history contains one August commit. Because that commit also added generated evidence timestamped 27 July, internal run timestamps were inspected separately from commit dates.

The August report will distinguish:

- **first versioned in August**: source or evidence first entered Git on 5 August;
- **August validation**: a run actually executed on 5 August;
- **late-July evidence incorporated in August**: a run executed on 27 July but committed with the August consolidation;
- **modeled future architecture**: capacity projections, not completed tests.

## 2. Position at the Start of August

At the end of July, the committed platform already included:

- the full security-gateway-to-dataspace AD-FLEX workflow;
- local mandatory-SLM foundations with micro-batching, strict validation, audit evidence, Ollama/vLLM provider interfaces, retry and dead-letter topics;
- a product dashboard separated from the technical operations dashboard;
- role-aware customer reads, household isolation, bounded analytics, validated aggregate insights, and responsive routes;
- one bounded household-fleet process representing 20 households and 241 devices across 13 categories;
- free Cloudflare Quick Tunnel scripts and a same-origin public-demo security boundary;
- a completed 15-device end-to-end demonstration and a 241-device ingestion/read-model demonstration;
- an unresolved local Phi-3 Mini throughput and structured-output-quality constraint.

Generated files later committed in August also record that staged 100-, 250-, 500-, and 1,000-asset functional runs were executed on 27 July. These runs are treated as late-July execution evidence, not August-only execution.

## 3. August Commit Reviewed

| Date | Commit | Branch | Subject | Scale of change |
|---|---|---|---|---:|
| 5 Aug 2026 | `f0bd3a11f2281c3c7ce4ab9b72bfca611817fdba` | `1000-assets-100-households-local-validation` | Update IoT pipeline implementation | 224 files; 29,591 insertions; 171 deletions |

No additional commits were present between 6 and 13 August. The worktree was clean when this audit began.

## 4. Files Added During August

### Exact population and configuration

- `config/household-profiles/apartment.json`
- `config/household-profiles/standard_home.json`
- `config/household-profiles/prosumer_home.json`
- `config/scale-1000-assets.json`

### Durable population and idempotency

- `database/timescale/013_scale_population_registry.sql`
- `database/timescale/014_scale_telemetry_idempotency.sql`

### Generator and validation tooling

- `services/household-fleet-simulator/src/primary-reading.js`
- `scripts/build-scalability-evidence.js`
- `scripts/run-1000-assets-stage.ps1`
- `scripts/run-1000-assets-validation.ps1`

### August programme documentation

- `docs/100-household-device-model.md`
- `docs/1000-assets-current-state-audit.md`
- `docs/1000-assets-workload-definition.md`
- `docs/1000-assets-validation-plan.md`
- `docs/1000-assets-validation-report.md`
- `docs/1000-assets-client-summary.md`
- `docs/1000-assets-limitations.md`
- `docs/million-device-scale-out-model.md`
- `docs/million-device-infrastructure-roadmap.md`

### Evidence bundle

The commit added staged run JSON/CSV/JSONL evidence, preflight provider benchmarks, resource samples, SLM outcome samples, Kafka lag and throughput samples, charts, and dashboard screenshots under `docs/scalability-results/`.

## 5. Files Significantly Modified During August

- fleet construction, persistence, profile logic, primary-reading selection, and tests;
- telemetry schema and handwritten validator compatibility;
- engine validation, normalization, database writes, normalized publisher, and tests;
- semantic provider prompt, Ollama/vLLM adapters, batch mapper, strict SAREF4ENER validation, and tests;
- customer read model, device search/profile filters, dashboard device/community pages, product shell, BFF routes, and smoke scripts;
- scale generator, stage runner, evidence sampler, provider benchmark, and topic configuration;
- `.env.example`, `docker-compose.yml`, and the semantic structured-output schema.

No existing production-style service was removed, and the command path remained simulated.

## 6. Features Implemented or Consolidated in August

### 6.1 Exact 100-household / 1,000-asset population

The fleet model was made deterministic rather than range-random:

| Profile | Households | Assets per household | Assets |
|---|---:|---:|---:|
| Apartment | 30 | 8 | 240 |
| Standard home | 50 | 10 | 500 |
| Prosumer home | 20 | 13 | 260 |
| **Total** | **100** |  | **1,000** |

The exact category totals were 100 smart meters, 220 smart plugs, 100 refrigerators, 100 washing machines, 100 lighting circuits, 100 water heaters, 30 thermostat/HVAC devices, 70 dishwashers, 70 heat pumps, 70 EV chargers, 20 solar inverters, and 20 home batteries.

Every identity was stable and unique. Seed `1000100`, `Europe/Dublin` time-zone context, household profile, occupancy/base-load context, measurement capabilities, deterministic schedule, and safety flags were retained.

### 6.2 One mandatory semantic reading per asset for population tests

The generator selected one primary measurement per asset while retaining state and identity as context. Later cycles can rotate the primary measurement, and a separate coverage mode sends complete multi-field payloads. This reduced local inference volume without bypassing the mandatory SLM.

### 6.3 Durable idempotency and retry handling

The August change preserved producer reading IDs through ingestion, normalization, Kafka, semantic storage, and IEEE storage. Migrations added population registration and conflict-safe message/reading uniqueness. Gateway retries reused stable identities, and semantic offsets advanced only after durable database/output completion.

### 6.4 Extended semantic vocabulary

The strict semantic allowlists and prompt context were extended across all requested categories and primary measurements. Every normalized reading still required local SLM processing. Invalid relationships, missing mappings, and unsafe output were retried and then stored as explicit safely-unmapped terminal outcomes. Deterministic logic did not create substitute mappings.

### 6.5 Scale-aware customer views

The customer read model gained exact cohort aggregation, household profile filters, category/device search, bounded pagination, and scale-aware community/device pages. Technical Kafka, worker, model, and database diagnostics remained protected in the operations dashboard.

### 6.6 Measured scale-out model

The repository added projections for 10,000, 100,000, and 1,000,000 assets based on the measured local completion rate, storage footprint, and generator memory slope. These are explicitly modeled infrastructure requirements, not validations.

## 7. August Validation Evidence

### 7.1 SLM batch preflight

Source: `docs/1000-assets-validation-report.md` and `docs/scalability-results/preflight/`.

| Batch size | Input | Valid mappings | Safely unmapped | Elapsed | Readings/s |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 1 | 0 | 2.07 s | 0.482 |
| 8 | 8 | 8 | 0 | 14.63 s | 0.547 |
| 16 | 16 | 14 | 2 | 43.07 s | 0.372 |
| 32 | 32 | 3 | 29 | 68.18 s | 0.469 |
| 64 | 64 | 0 | 64 | 129.11 s | 0.496 |

Batch size 8 was selected because it produced the best measured combination of rate and fully valid structured output on the local model.

### 7.2 Full-field semantic coverage run, 5 August

Run: `scale-100-2026-08-05T06-59-10-798Z`.

| Measure | Result |
|---|---:|
| Households / assets / categories | 10 / 100 / 12 |
| Telemetry messages | 100 accepted of 100 |
| Normalized / terminal SLM outcomes | 374 / 374 |
| `slm_called=true` | 374 (100%) |
| Validated mappings / safely unmapped | 339 / 35 |
| Maximum / final Kafka lag | 159 / 0 |
| Drops / duplicate final rows / processing errors | 0 / 0 / 0 |
| Classification | `functional_end_to_end_pass` |

The complete representative flexibility, mock command, and privacy-aware dataspace workflow also completed with no unsafe execution rows.

### 7.3 Sustained-arrival 1,000-asset run, 5 August

Run: `scale-1000-2026-08-05T07-15-27-418Z`.

| Measure | Result |
|---|---:|
| Households / assets | 100 / 1,000 |
| Telemetry / normalized / terminal outcomes | 1,000 / 1,000 / 1,000 |
| SLM invocation | 100% |
| Validated mappings / safely unmapped | 961 / 39 |
| Mapping acceptance / safely-unmapped rate | 96.1% / 3.9% |
| Arrival / completion rate | 1.102 / 0.445 readings/s |
| Maximum / final Kafka lag | 643 / 0 |
| Backlog clearance after generation | 1,345.714 s |
| Drops / duplicates / processing errors | 0 / 0 / 0 |
| Required inference improvement at tested arrival | 2.478x |
| Classification | `functional_only` |

All messages eventually completed and the backlog returned to zero, but the local worker did not keep pace with arrival. This is a successful asynchronous functional completion and a failed sustained real-time criterion.

### 7.4 Functional stage evidence incorporated from 27 July

The August commit formally added the staged 100-, 250-, 500-, and 1,000-asset functional evidence generated on 27 July. The authoritative 1,000-asset functional run recorded 1,000 SLM calls (100%), 969 validated mappings, 31 safely-unmapped results, 969 semantic and 969 IEEE rows, zero duplicates/errors/drops, maximum/final lag 762/0, and completion of representative approval, mock dispatch, device translation, and minimized export.

Because its run timestamp is July, this evidence is described as incorporated/consolidated in August, not executed anew in August.

### 7.5 Regression and configuration checks

Source: `docs/1000-assets-validation-report.md`.

- 225 automated tests passed;
- semantic connector: 44 tests;
- security gateway: 42 tests;
- engine: 9 tests;
- household fleet: 10 tests;
- ingestion API: 8 tests;
- aggregator: 12 tests;
- approval workflow: 20 tests;
- IEEE translator: 9 tests;
- mock dispatch adapter: 11 tests;
- device command translator: 12 tests;
- dataspace export: 14 tests;
- Shelly, Enode, and heat-pump simulators: 15 tests;
- scale generator/evidence: 11 tests;
- customer product boundaries: 8 tests;
- 132 JavaScript files and 21 PowerShell scripts passed syntax checks;
- Docker Compose configuration passed;
- customer-console lint, production build, client-boundary checks, product tests, responsive/accessibility smoke, and scale-aware browser smoke passed.

### 7.6 Resource and dashboard evidence

- host: Intel Core i9-13900HX, 32 logical CPUs, approximately 16.9 GB memory visible to Node;
- GPU: NVIDIA RTX 4070 Laptop GPU, 8,188 MiB;
- Phi-3 Mini GPU memory approximately 3.79 GiB and observed utilization up to 98%;
- generator peak RSS: 74.57 MiB;
- approximate incremental generator memory slope: 16.9 KiB per virtual asset;
- Kafka peaked above one CPU core in bursts and remained under 1 GiB in sampled memory;
- ten community aggregate queries averaged 1.25 s (p95 1.33 s);
- ten filtered 25-row device queries averaged 0.96 s (p95 1.04 s);
- browser evidence showed exact 100-household/1,000-asset totals and bounded device pages without mobile horizontal overflow.

The measured bottleneck was the single local Phi-3 Mini inference tier, not the generator, gateway, Kafka, TimescaleDB, or dashboard query path.

## 8. Problems and Resolutions Evidenced in August

| Challenge | Impact | Resolution | Result |
|---|---|---|---|
| Initial 250-asset attempt had seven gateway transport failures | Stage could not be accepted as complete | Added bounded retry using stable message/reading identities | Authoritative rerun accepted all 250 messages with no duplicates |
| Nullable `current_primary_measurement` passed JSON schema but failed handwritten validation | Valid coverage envelopes were rejected | Aligned validator with schema and added regression test | Coverage run accepted the intended envelope shape |
| An unrelated demo-stack restart interfered with one coverage attempt | Evidence could be contaminated by another fleet/group | Excluded the run; wrapper now stops continuous fleet and checks group isolation at start/end | 5 August coverage evidence is isolated |
| Large local SLM batches degraded structured-output quality | 32/64-reading batches became mostly/all safely unmapped | Benchmarked 1/8/16/32/64 and selected batch 8 | Stable local quality/throughput compromise |
| Single-worker inference lagged arrival | Sustained criterion failed despite eventual completion | Preserved Kafka backpressure, measured clearance, and published required improvement factor | No loss, but result correctly classified `functional_only` |

## 9. Documentation and Visual Evidence

### Current-month screenshots

- `docs/scalability-results/scale-1000-2026-08-05T07-15-27-418Z/screenshots/customer-dashboard-desktop.png`
- `docs/scalability-results/scale-1000-2026-08-05T07-15-27-418Z/screenshots/customer-dashboard-tablet.png`
- `docs/scalability-results/scale-1000-2026-08-05T07-15-27-418Z/screenshots/customer-dashboard-mobile.png`
- `docs/scalability-results/scale-1000-2026-08-05T07-15-27-418Z/screenshots/customer-dashboard-device-page.png`
- `docs/scalability-results/scale-1000-2026-08-05T07-15-27-418Z/screenshots/customer-dashboard-community-scale.png`

### Charts

- device-category chart;
- throughput chart;
- SLM/end-to-end latency chart;
- Kafka lag chart.

### Machine-readable evidence

The run directory contains resolved configuration, device inventory JSONL, generator/resource/throughput/Kafka-lag JSONL, SLM outcome samples, semantic category outcomes, stage-result JSON, CSV summary, and dashboard query benchmark data.

## 10. Features Existing Before August and Not Attributed to August

- the core Phase 1-9 event-driven services and databases;
- security gateway, DSO translation, aggregator, approval, mock dispatch, device translation, and dataspace export;
- local SLM-primary architecture and SAREF4ENER guardrails;
- first micro-batching/provider abstractions and 10,000-device planning artifacts;
- customer product routes, role-aware read layer, AI insight framework, and operations-dashboard separation;
- 20-household/241-device fleet, public-demo scripts, and Quick Tunnel architecture.

August refined and validated these foundations for the exact 1,000-asset scenario.

## 11. Unresolved Ambiguity and Claim Boundaries

1. **Commit date versus run date:** the 5 August commit contains 27 July generated runs. Resolution: August receives credit for formal integration, fixes, reporting, and fresh 5 August tests; execution of the 27 July stages remains late-July evidence.
2. **Functional versus sustained:** both 1,000-asset runs eventually cleared. Resolution: the functional run is an asynchronous end-to-end pass; the sustained test is `functional_only` because completion throughput remained below arrival.
3. **Million-device material:** projection formulas are measured-model outputs, not test results. No 10,000-, 100,000-, or million-asset end-to-end validation is claimed.
4. **Household targeting:** the flexibility test selected five households from each profile as audit context, but the current DSO contract remains community-scoped. Enforced household cohort targeting remains future work.
5. **Protocol/data-space status:** IEEE 2030.5 and ENERSHARE/IDS remain compatible/foundation-style descriptions without certification or production connector credentials.

## 12. August End-State Summary

By 13 August, the repository contained an exact, reproducible 100-household/1,000-asset workload, durable identity safeguards, full mandatory-SLM evidence, extended semantic coverage, scale-aware customer views, machine-readable run evidence, and a measured future infrastructure model. The platform passed controlled functional completion without loss or duplicates. The local laptop did not pass sustained real-time processing at the tested 15-minute profile; measured Phi-3 Mini capacity remained the limiting factor and required at least 2.478x improvement at that arrival rate before headroom.

