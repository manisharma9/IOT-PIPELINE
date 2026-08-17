# 100-Household / 1,000-Asset Local Validation Report

**Validation dates:** 27 July-5 August 2026  
**Branch:** `1000-assets-100-households-local-validation`  
**Environment:** local Windows laptop, Docker Desktop, local Kafka,
TimescaleDB, Ollama, and Phi-3 Mini  
**Safety mode:** simulation only; `no_real_execution=true`

## Executive summary

AD-FLEX completed a controlled functional validation representing exactly
100 households and 1,000 unique simulated energy assets. Every generated
primary semantic reading was submitted to local Phi-3 Mini through Ollama.
The deterministic SAREF4ENER layer validated or rejected model proposals; it
did not create replacement mappings.

The authoritative 1,000-asset population run:

- accepted and normalized all 1,000 updates;
- recorded `slm_called=true` for all 1,000 readings;
- accepted 969 SLM mappings and stored 31 explicit safely-unmapped outcomes;
- stored 969 semantic and 969 IEEE 2030.5-style events;
- recorded no processing errors, silent drops, or duplicate durable rows;
- cleared semantic Kafka lag from a measured maximum of 762 to zero;
- completed representative approval, mock dispatch, device translation, and
  privacy-aware dataspace export;
- retained `no_real_execution=true` throughout the command path.

The local inference tier did not keep up with the 1.666 readings/s arrival
rate. Durable semantic completion was 0.424 readings/s and backlog clearance
continued for 1,757 seconds after generation stopped. The result is therefore
an **asynchronous functional end-to-end pass**, not a sustained real-time
capacity claim.

## Test environment

| Component | Measured configuration |
|---|---|
| Host | Windows 10.0.26200 x64 |
| CPU | Intel Core i9-13900HX, 32 logical CPUs |
| Host memory visible to Node | 16.9 GB |
| GPU | NVIDIA GeForce RTX 4070 Laptop GPU, 8,188 MiB |
| Docker memory limit | 7.621 GiB |
| Inference | Local Ollama, `phi3:mini` |
| Kafka | One local broker, six main-topic partitions |
| Storage | Local TimescaleDB/PostgreSQL |
| Semantic workers | One connector, two Kafka partitions concurrently |
| Provider concurrency | One bounded Ollama request |
| SLM batch | Maximum 8 readings, 20 ms wait, one retry for measured runs |

This single-node environment validates logical behavior and measured local
limits. It does not provide broker, database, or inference high availability.

## Deterministic population

| Profile | Households | Assets per household | Assets |
|---|---:|---:|---:|
| Apartment | 30 | 8 | 240 |
| Standard home | 50 | 10 | 500 |
| Prosumer home | 20 | 13 | 260 |
| **Total** | **100** |  | **1,000** |

| Device category | Assets |
|---|---:|
| Smart meter | 100 |
| Smart plug | 220 |
| Refrigerator | 100 |
| Washing machine | 100 |
| Lighting circuit | 100 |
| Water heater | 100 |
| Thermostat/HVAC | 30 |
| Dishwasher | 70 |
| Heat pump | 70 |
| EV charger | 70 |
| Solar inverter | 20 |
| Home battery | 20 |
| **Total** | **1,000** |

All household IDs, device IDs, message IDs, reading IDs, and correlation IDs
were unique. State evolution and schedules used seed `1000100`. The generator
used one bounded process and deterministic per-device offsets; it did not
create one process, thread, timer, or container per asset.

## Implementation changes

### Fleet and telemetry

- Added exact apartment, standard-home, and prosumer inventories.
- Added deterministic stage subsets for 100, 250, 500, and 1,000 assets.
- Preserved one primary semantic reading per asset for the population test.
- Preserved identity, state, capabilities, profile, schedule, simulation, and
  safety metadata as context rather than extra semantic readings.
- Added complete multi-field coverage mode for representative devices.
- Reused the same idempotent message and reading identities on bounded
  gateway transport retries.

### Durable processing

- Added a simulated-device registry and transactional registry upsert.
- Added message/reading uniqueness migration 014.
- Preserved producer reading IDs through normalization and Kafka.
- Used conflict-safe raw, normalized, semantic, and IEEE writes.
- Kept offsets durable: semantic offsets advance only after database and
  output-topic completion.

### Semantic processing

- Extended strict concepts, properties, units, and device context for every
  requested category.
- Required local SLM processing for every normalized reading.
- Preserved structured reading-ID reconciliation, retries, explicit
  safely-unmapped outcomes, and command-output rejection.
- Selected batch size 8 after a direct local provider benchmark.

### Customer read model

- Added the exact scale-cohort aggregate to the anonymized community view.
- Added server-side profile and device search filters.
- Retained household authorization and bounded pagination.
- Kept model, Kafka, database, and worker diagnostics in the protected
  operations dashboard.

## SLM batch preflight

| Batch | Input | Mapped | Safely unmapped | Elapsed | Readings/s |
|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 1 | 0 | 2.07 s | 0.482 |
| 8 | 8 | 8 | 0 | 14.63 s | 0.547 |
| 16 | 16 | 14 | 2 | 43.07 s | 0.372 |
| 32 | 32 | 3 | 29 | 68.18 s | 0.469 |
| 64 | 64 | 0 | 64 | 129.11 s | 0.496 |

Batch 8 was selected because it produced the best measured rate while all
eight outputs passed strict validation. Larger batches did not provide
acceptable structured-output quality on this local model.

## Staged functional results

| Assets | Households | Result | SLM calls | Mapped | Safely unmapped | Completion r/s | Max / final lag |
|---:|---:|---|---:|---:|---:|---:|---:|
| 100 | 10 | Passed | 100% | 98 | 2 | 0.369 | 93 / 0 |
| 250 | 25 | Passed | 100% | 246 | 4 | 0.386 | 73 / 0 |
| 500 | 50 | Passed | 100% | 487 | 13 | 0.430 | 420 / 0 |
| 1,000 | 100 | Passed | 100% | 969 | 31 | 0.424 | 762 / 0 |

Each row is the latest authoritative passed functional run for that stage.
Every stage waited for terminal SLM audit outcomes, mapped-or-unmapped
durability, IEEE completion or explicit safe unmapping, and zero final lag.
HTTP or Kafka queue acceptance alone was not treated as success.

## 1,000-asset runtime result

| Measure | Result |
|---|---:|
| Planned / accepted telemetry | 1,000 / 1,000 |
| Gateway bounded retries | 17 |
| Generated / normalized readings | 1,000 / 1,000 |
| Mandatory SLM audit rows | 1,000 |
| `slm_called=true` | 1,000 (100%) |
| SLM output received | 1,000 |
| Mapped / safely unmapped | 969 / 31 |
| Retried readings / extra attempts | 113 / 113 |
| Semantic / IEEE rows | 969 / 969 |
| Processing errors | 0 |
| Duplicate normalized / audit / semantic / IEEE IDs | 0 / 0 / 0 / 0 |
| SLM batches / average / maximum size | 140 / 7.14 / 8 |
| Average semantic database latency | 72.71 ms |
| SLM p50 / p95 / p99 | 16.39 / 26.89 / 29.86 s |
| Raw-to-terminal p50 / p95 / p99 | 566.0 / 1,785.2 / 1,804.4 s |
| Generation / full wall clock | 600.1 / 2,382.6 s |
| Backlog clearance after generation | 1,757.4 s |
| Arrival / durable completion | 1.666 / 0.424 readings/s |
| Measured improvement required at that arrival | 3.927x |

Gateway response time was 10.47 ms minimum, 249.77 ms average, and
8,687.55 ms maximum. Transport retries recovered all transient failures
without changing idempotency keys.

## Semantic outcomes by category

| Category | Readings | Mapped | Safely unmapped |
|---|---:|---:|---:|
| Dishwasher | 70 | 70 | 0 |
| EV charger | 70 | 67 | 3 |
| Heat pump | 70 | 68 | 2 |
| Home battery | 20 | 1 | 19 |
| Lighting circuit | 100 | 100 | 0 |
| Refrigerator | 100 | 98 | 2 |
| Smart meter | 100 | 100 | 0 |
| Smart plug | 220 | 219 | 1 |
| Solar inverter | 20 | 20 | 0 |
| Thermostat/HVAC | 30 | 27 | 3 |
| Washing machine | 100 | 99 | 1 |
| Water heater | 100 | 100 | 0 |

The principal quality gap is home-battery state-of-charge output. The
validator rejected invalid property/unit relationships and stored explicit
terminal outcomes. No deterministic replacement mapping was created.

## Kafka and database evidence

The main telemetry topics were increased safely to six partitions. Retry and
dead-letter topics retained twelve existing partitions. The optional topic
configuration script does not reduce or destructively recreate topics.

At the end of the authoritative 1,000-asset run:

- maximum measured semantic lag was 762 readings;
- all six partition lags returned to zero;
- no accepted reading was silently dropped;
- no normalized, audit, semantic, or IEEE duplicate reading ID existed;
- no processing-error row was created for the run.

Current mixed-history hypertable sizes show that SLM audit and normalized
data are significant retention classes. The measured scale-out model uses
these sizes as order-of-magnitude inputs and does not present them as a
compression guarantee.

## Flexibility and dataspace evidence

The functional run selected five apartment, five standard-home, and five
prosumer households for representative validation. The current DSO schema is
community scoped, so the selected cohort is audit context rather than an
enforced dispatch scope. This limitation is reported rather than hidden.

Three proposals progressed through review, approval, and
`ready_to_dispatch`. The mock adapter stored three audit results and the
device-command translator stored seven simulated command results. Unsafe
execution rows were zero. Dataspace exports applied minimization and
pseudonymization and returned `no_raw_private_payloads=true`.

No physical device was controlled.

## Dashboard evidence

The customer read model independently returned:

- 100 validation households;
- 1,000 registered validation assets;
- exact profile and category totals;
- bounded semantic-completion progress;
- `simulated=true` and `no_real_execution=true`.

Ten community aggregate queries averaged 1.25 seconds with p95 1.33 seconds.
Ten filtered 25-row device queries averaged 0.96 seconds with p95 1.04
seconds while local inference was active. The browser receives paginated
results, not all 1,000 device records.

## Semantic coverage and sustained-local results

The separate full-field coverage run used 100 assets across all 12 device
categories. It produced 374 normalized readings. All 374 readings called
local Ollama `phi3:mini`; 339 mappings passed deterministic SAREF4ENER
validation and 35 reached the explicit safely-unmapped terminal state. The
run had no drops, duplicates, processing errors, or residual Kafka lag.

| Coverage measure | Result |
|---|---:|
| Run ID | `scale-100-2026-08-05T06-59-10-798Z` |
| Assets / households | 100 / 10 |
| Device categories represented | 12 / 12 |
| Normalized / terminal SLM outcomes | 374 / 374 |
| SLM invocation | 100% |
| Accepted / safely unmapped mappings | 339 / 35 |
| Maximum / final Kafka lag | 159 / 0 |
| Drops / duplicate final rows / errors | 0 / 0 / 0 |
| Classification | `functional_end_to_end_pass` |

The sustained-local run then scheduled exactly 1,000 assets across 100
households over 15 minutes. All 1,000 messages were eventually processed and
stored, but the local inference worker did not keep pace with the arrival
rate. The result is therefore `functional_only`, not a sustained real-time
pass.

| Sustained-local measure | Result |
|---|---:|
| Run ID | `scale-1000-2026-08-05T07-15-27-418Z` |
| Telemetry / normalized / terminal outcomes | 1,000 / 1,000 / 1,000 |
| SLM invocation | 100% |
| Accepted / safely unmapped mappings | 961 / 39 |
| Arrival / completion rate | 1.102 / 0.445 readings/s |
| Required inference improvement | 2.478x |
| Maximum / final Kafka lag | 643 / 0 |
| Backlog clearance after generation | 1,345.714 seconds |
| Drops / duplicate final rows / errors | 0 / 0 / 0 |
| Classification | `functional_only` |

This distinction matters: the architecture preserved and eventually cleared
the workload without loss, but one local Phi-3 Mini worker is not a sustained
1,000-asset real-time tier at the tested interval.

## Failures found and fixed

The validation retained failed and aborted attempts instead of presenting
only successful runs:

1. An initial 250-asset attempt had seven gateway transport failures. Bounded
   retry with stable idempotency identities was added; the authoritative
   rerun accepted all 250 messages.
2. Coverage envelopes containing
   `metadata.current_primary_measurement=null` matched the JSON schema but
   were rejected by the handwritten validator. The validator was aligned
   and a regression test now protects the nullable field.
3. A separate demo-stack startup recreated services during one coverage
   attempt. The run was excluded. The wrapper now stops the continuous fleet,
   verifies the isolated semantic group, and the Node runner checks that
   group at both start and completion.

## Automated validation

The completed regression pass includes 225 automated tests:

- semantic connector: 44 tests;
- security gateway: 42 tests;
- engine: 9 tests;
- fleet simulator: 10 tests;
- ingestion API: 8 tests;
- aggregator: 12 tests;
- approval workflow: 20 tests;
- IEEE translator: 9 tests;
- mock dispatch adapter: 11 tests;
- device command translator: 12 tests;
- dataspace export: 14 tests;
- Shelly, Enode, and heat-pump simulators: 15 tests;
- scale generator/evidence: 11 tests;
- customer product boundaries: 8 tests.

Docker Compose configuration, all 21 PowerShell scripts, and 132 JavaScript
files passed syntax/configuration validation. The deprecated top-level
Compose `version` key was removed after its warning caused strict PowerShell
validation to terminate before a run could start; this does not change
service behavior.

The customer console also passed its client-boundary check, eight product
tests, ESLint, production build, live responsive/accessibility smoke test,
and scale-aware browser smoke. The browser evidence confirmed the exact
100-household/1,000-asset aggregate, bounded 12-row device pages, and no
horizontal overflow at 390 pixels.

## Reproduction

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
$env:EDGE_API_KEY = (Select-String .env '^EDGE_API_KEY=').Line.Split('=', 2)[1]
$env:SEMANTIC_CONNECTOR_GROUP_ID = 'adflex-1000-assets-validation-repro'
$env:SLM_BATCH_MAX_READINGS = '8'
$env:SLM_BATCH_MAX_RETRIES = '1'
$env:SLM_PROVIDER_MAX_CONCURRENCY = '1'
$env:SEMANTIC_PARTITIONS_CONCURRENTLY = '2'

docker compose up -d --build
Get-Content .\database\timescale\013_scale_population_registry.sql |
  docker compose exec -T timescaledb psql -U energy_user -d energy_flex
Get-Content .\database\timescale\014_scale_telemetry_idempotency.sql |
  docker compose exec -T timescaledb psql -U energy_user -d energy_flex
powershell -ExecutionPolicy Bypass -File .\scripts\configure-scalability-topics.ps1 `
  -Devices 1000 -Apply
docker compose up -d --force-recreate semantic-connector

powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 100 -ConsumerGroup $env:SEMANTIC_CONNECTOR_GROUP_ID
powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 250 -ConsumerGroup $env:SEMANTIC_CONNECTOR_GROUP_ID
powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 500 -ConsumerGroup $env:SEMANTIC_CONNECTOR_GROUP_ID
powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 1000 -ConsumerGroup $env:SEMANTIC_CONNECTOR_GROUP_ID
powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 100 -TestMode coverage -IntervalSeconds 900 `
  -ReportingWindowSeconds 600 -ConsumerGroup $env:SEMANTIC_CONNECTOR_GROUP_ID
powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 1000 -TestMode sustained -IntervalSeconds 900 `
  -ReportingWindowSeconds 900 -ConsumerGroup $env:SEMANTIC_CONNECTOR_GROUP_ID
```

Ollama must be running locally with `phi3:mini`. Each stage can take much
longer than its generation window because completion waits for mandatory
inference and zero Kafka lag.

## Resource observations

- Phi-3 Mini used approximately 3.79 GiB GPU memory.
- GPU utilization reached 98% during the 1,000-asset run.
- Generator RSS peaked at 74.57 MiB.
- The observed incremental generator memory slope from 100 to 1,000 assets
  was approximately 16.9 KiB per virtual asset.
- Kafka peaked above one CPU core during bursts and remained below 1 GiB
  memory in measured samples.
- TimescaleDB and Node services remained running without memory failures.

The inference model, not fleet generation, Kafka, gateway, or database
insertion, was the exact measured bottleneck.

## Final validation conclusion

The local AD-FLEX platform has passed the controlled **functional**
validation for exactly 100 households and 1,000 assets. Every generated
reading was submitted to the mandatory local SLM, every reading received an
auditable terminal outcome, all durable queues cleared, and the representative
approval, mock-dispatch, device-translation, and privacy-aware export workflow
completed with `no_real_execution=true`.

The same laptop did **not** demonstrate sustained processing at the tested
15-minute reporting profile. Its measured semantic completion rate was 0.445
readings/s against 1.102 readings/s arrival. The exact bottleneck was the
single saturated local Phi-3 Mini inference tier. A future sustained test
requires at least 2.478x measured inference capacity plus operating headroom;
the scale-out documents model this requirement without claiming that it has
already been validated.

## Evidence locations

- Machine results: `docs/scalability-results/`
- Authoritative 1,000-asset run:
  `docs/scalability-results/scale-1000-2026-07-27T09-32-08-317Z/`
- Full-field coverage run:
  `docs/scalability-results/scale-100-2026-08-05T06-59-10-798Z/`
- 15-minute sustained-local run:
  `docs/scalability-results/scale-1000-2026-08-05T07-15-27-418Z/`
- Cross-stage CSV: `docs/scalability-results/stage-summary.csv`
- Throughput, latency, lag, and category charts:
  `docs/scalability-results/*.svg`
- Measured scale-out model: `docs/million-device-scale-out-model.md`
- Architecture roadmap: `docs/million-device-infrastructure-roadmap.md`
