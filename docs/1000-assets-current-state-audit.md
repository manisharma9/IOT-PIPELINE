# 1,000-Asset Local Validation: Current-State Audit

**Audit date:** 27 July 2026  
**Branch:** `1000-assets-100-households-local-validation`  
**Audited revision:** `8ef7b65`  
**Scope:** repository implementation and live local runtime before the
100-household, 1,000-asset changes

## Executive finding

AD-FLEX already contains most of the foundations needed for the requested
validation: a bounded in-memory fleet simulator, all required device
categories, stable Kafka keys, mandatory local SLM processing, strict
reading-level SLM reconciliation, retry and dead-letter topics, durable SLM
audit evidence, server-side customer read models, and staged scale-test
tooling.

The existing scale workload is not the requested workload. It creates only
Shelly Plug, EV charger, and heat-pump devices; distributes devices evenly
instead of using the specified household inventories; and emits about four
semantic readings per update. The current default fleet is also a random
20-household population rather than an exact 100-household population.

The principal measured constraint is local Phi-3 Mini throughput. A previous
100-device run produced 400 readings and did not drain within its allowed
window. The requested one-primary-reading-per-asset strategy reduces the
equivalent functional stage to 100 mandatory SLM readings without bypassing
the SLM.

## Current telemetry flow

The implemented HTTP path is:

```text
simulator or scale generator
  -> security-gateway POST /telemetry
  -> ingestion-api POST /telemetry
  -> Kafka raw.telemetry
  -> engine validation and normalization
  -> TimescaleDB raw_telemetry and normalized_telemetry
  -> Kafka normalized.telemetry
```

The MQTT path publishes compatible telemetry through the MQTT broker and
`mqtt-subscriber` into the same `raw.telemetry` topic.

The security gateway applies API-key validation, request inspection, rate
limits, correlation IDs, and audit recording. Kafka message keys use
community, household, and device identity, preserving household/device
ordering within a partition.

## Current telemetry shape

The canonical envelope uses:

- `community_id`
- `household_id`
- `device_id`
- `device_type`
- `timestamp`
- `readings`
- `protocol`
- `source`

The compatibility layer also accepts `communityId`, `householdId`,
`deviceId`, `deviceType`, and `data`. Simulator envelopes deliberately
contain both forms. Each reading is numeric or has a numeric `value` and
optional `unit`.

The engine creates one normalized row and one `normalized.telemetry` message
for every entry in `readings`. Reading IDs are deterministic hashes of source
identity, event time, device identity, and reading name.

## Existing simulator architecture

`services/common/simulators/base-device.js` defines the shared `tick()` and
`getTelemetry()` contract. The current implementation supports:

- smart meter
- smart plug / Shelly Plug
- refrigerator
- washing machine
- clothes dryer
- dishwasher
- lighting circuit
- Enode/Easee EV charger
- heat pump
- thermostat/HVAC
- water heater
- solar inverter
- home battery

`services/household-fleet-simulator` runs one scheduler with bounded
concurrency. It does not create one process, thread, timer, or container per
device. Device state is held in memory and telemetry delivery retains a
bounded pending envelope for retry.

Current limitations:

- profile sizes are randomly selected within ranges;
- the default is 20 households, currently 241 registered devices;
- exact profile inventories are not enforced;
- initial scheduling uses array position rather than a stable device-ID hash;
- the scheduler scans and sorts due devices on every tick;
- inventory records omit explicit time zone, occupancy, base-load profile,
  measurement capability, and deterministic reporting offset;
- normal telemetry contains multiple readings rather than selecting one
  primary semantic reading for the first scale cycle.

## Existing scalability generator

`scripts/run-scale-validation.js` is streaming and memory bounded. It supports
seeded generation, ramp, steady, burst and soak-style cycles, bounded gateway
concurrency, unique message/correlation/reading identities, JSONL evidence,
and process-resource samples.

It currently supports only three factories:

- Shelly Plug
- Enode/Easee EV charger
- heat pump

It distributes devices round-robin across households and emits every reading
returned by a device. Therefore it cannot represent the exact 30 apartment,
50 standard-home, and 20 prosumer-home population without modification.

`scripts/run-scale-stage.js` already checks gateway acceptance, normalization,
SLM audit completion, semantic/IEEE duplicates, processing errors, Kafka lag,
safe approval/mock dispatch, and dataspace export. It correctly distinguishes
queue acceptance from end-to-end completion.

## Normalized-reading and semantic flow

The semantic connector:

1. consumes `normalized.telemetry`;
2. validates each normalized message;
3. preserves or derives `reading_id`;
4. splits Kafka batches by reading count and prompt-token limit;
5. calls the configured inference provider for every reading;
6. reconciles each response by `reading_id`;
7. validates confidence, concept, property, unit, and command-safety rules;
8. retries rejected or missing mappings;
9. persists either a mapped semantic event or a safely-unmapped terminal audit;
10. commits Kafka offsets only after durable processing;
11. publishes mapped rows to `semantic.enriched` and terminal failures to the
    dead-letter topic.

`SLM_ENABLED=false` is rejected at startup. Deterministic logic validates the
SLM proposal; it does not synthesize a successful semantic replacement.

## Current SLM request pattern

The provider-independent interface supports:

- `SLM_PROVIDER=ollama`
- `SLM_PROVIDER=vllm`

The live local provider is Ollama at
`http://host.docker.internal:11434`, model `phi3:mini`. Ollama was reachable
during this audit, both `phi3:mini` and `phi3:latest` were installed, and the
RTX 4070 Laptop GPU showed approximately 3.8 GiB of 8.2 GiB VRAM in use with
about 93% utilization while the inherited backlog was processing.

The prompt is compact and requests JSON only. The strict batch schema requires
one independently identifiable mapping per reading:

- `reading_id`
- `saref_concept`
- `saref_property`
- `saref_unit`
- `confidence`
- `mapping_reason_code`

Free-form explanation and command fields are forbidden.

## Timeout, retry, and consumer-session behavior

Current defaults in `.env.example` are:

- maximum 128 readings per batch;
- 20 ms batching wait;
- 4,096 estimated prompt tokens;
- two retries after the first attempt;
- one provider request in flight;
- two Kafka partitions consumed concurrently;
- 180-second Kafka session timeout;
- 3-second heartbeat.

The consumer enforces a session timeout greater than the total configured SLM
attempt window plus 30 seconds. A heartbeat timer runs during inference.
Accepted readings leave the retry set; only rejected or missing readings are
retried. Exhausted readings become explicit `safely_unmapped` outcomes.

## SAREF4ENER validation coverage

The strict allowlists cover power, energy, voltage, current, frequency,
temperature, state of charge, power factor, and generic safe property
semantics. Supported units include kW, kWh, V, A, Hz, percent, degrees Celsius,
and unitless values.

The new categories can already emit compatible numeric readings. Their
primary-reading selection still needs to be constrained to the supported
semantic vocabulary, and validator coverage needs tests for every selected
field. Device metadata must remain context and must not become unnecessary
SLM readings.

## Kafka configuration observed live

The local deployment is a single Kafka broker with replication factor one.
Observed partitions were:

| Topic | Partitions |
|---|---:|
| `raw.telemetry` | 3 |
| `normalized.telemetry` | 3 |
| `semantic.enriched` | 3 |
| `semantic.mapping.retry` | 12 |
| `semantic.mapping.dlq` | 12 |
| workflow and audit topics | 1 each |

The semantic consumer group is
`saref4ener-semantic-connector`. One active worker was present. At the audit
snapshot its three normalized-topic partitions had lags of 10,811, 12,094,
and 13,802, for a total inherited lag of 36,707 readings.

That backlog came from an already-running prior demonstration fleet and is
not evidence about the new workload. The fleet generator was stopped after
capturing the audit state. No topic or stored data was deleted. New staged
validation needs a fresh named consumer group and must report its own lag.

The repository recommends six partitions at the 1,000-device level, but the
live telemetry topics currently have three. The existing topic script only
increases partitions when explicitly invoked; it does not destructively
recreate topics.

## Durable identity and database writes

The relevant storage objects are:

- `raw_telemetry`
- `normalized_telemetry`
- `semantic_events`
- `semantic_slm_audit`
- `semantic_batch_metrics`
- `ieee20305_events`
- `simulated_device_registry`
- dispatch, approval, mock-execution, device-command, security, and dataspace
  audit tables

The current live database contained:

| Measure | Audit value |
|---|---:|
| registered devices | 241 |
| registered households | 20 |
| raw telemetry rows | 14,140 |
| normalized rows | 53,074 |
| SLM audit rows | 16,932 |
| mapped semantic rows | 534 |
| IEEE-style rows | 554 |
| duplicate normalized reading IDs | 0 |
| duplicate semantic reading IDs | 0 |
| duplicate SLM-audit reading IDs | 0 |

Writes use transactions at the semantic-outcome boundary and conflict-aware
inserts. Unique indexes include both `event_time` and `reading_id`, as
required by Timescale hypertable uniqueness rules. This prevents duplicate
rows for an exact replay with the same event time, but does not provide a
global reading-ID registry independent of time. The stage runner explicitly
queries for duplicate reading IDs and must fail a stage if any are found.

The engine inserts normalized rows individually. Semantic outcomes are also
persisted per reading, followed by a batch-metrics insert. This is acceptable
for the controlled local validation but database latency must be measured.

## Mandatory SLM evidence

`semantic_slm_audit` already stores:

- reading, household, and device identity;
- provider, model, worker, batch, and request identity;
- attempt count and inference timestamps;
- inference latency and output-received flag;
- SLM mapping and confidence;
- deterministic-validation result;
- failure reason;
- final status and safely-unmapped flag;
- inference-server identity and processed time.

No hidden chain-of-thought is stored. A mapped row is not required for a safe
terminal outcome, but `slm_called=true` is required for every normalized
reading in a passing stage.

## Customer dashboard behavior

The customer dashboard uses same-origin Next.js API routes and the security
gateway customer read model. It does not query Kafka, Ollama, or TimescaleDB
from the browser.

Already implemented:

- household-scoped authorization and pseudonymized operator selection;
- household/device isolation;
- server-side device pagination;
- category, online, flexibility, and state filtering;
- aggregate current power, daily energy, flexibility, and category counts;
- bounded time-series queries;
- responsive product routes;
- separate technical operations dashboard.

Gaps for this validation:

- no household-profile filter on the device inventory;
- no operator-level population summary explicitly showing the target cohort;
- no 100/1,000 stage-progress read model;
- no bounded household search for the 100-household selector;
- current historical database contents include prior demo populations, so
  evidence must identify the new run cohort rather than counting all history.

## Resource-monitoring behavior

The stage sampler records:

- Kafka consumer lag;
- Docker container CPU and memory;
- host CPU and memory;
- GPU utilization and VRAM when `nvidia-smi` is available;
- database and SLM batch metrics.

Generator events and resource samples are streamed as JSONL. The generator
does not retain full history, although gateway latency values are currently
kept in memory for percentile summaries. At 1,000 messages this is bounded and
small.

The audited laptop has:

| Resource | Observed specification |
|---|---|
| CPU | Intel Core i9-13900HX, 24 cores / 32 logical processors |
| RAM | approximately 16 GB |
| GPU | NVIDIA RTX 4070 Laptop GPU, 8,188 MiB VRAM |
| Docker memory limit observed | approximately 7.6 GiB |
| Kafka | one local broker |
| TimescaleDB | one local instance |
| Ollama | local Phi-3 Mini |

## Measured bottleneck and risks

A previous stage represented 100 devices but emitted 400 readings. With a
batch size of eight, one provider request at a time, and no retry, it completed
344 audits in about 21 minutes, left 112 readings of lag, and therefore
failed. Measured direct provider throughput was approximately 0.29
reading/second for batch one and 0.60 reading/second for batches four and
eight.

Primary risks for 1,000 assets are:

1. local SLM throughput and variable structured-output latency;
2. inherited Kafka lag contaminating measurements;
3. gateway rate limits if the reporting window is shortened;
4. validator rejection for fields that are technically supported but mapped
   inconsistently by Phi-3 Mini;
5. retries multiplying inference time;
6. one local GPU becoming unstable under excessive concurrency;
7. historical rows inflating dashboard population counts;
8. three live telemetry partitions rather than the recommended six;
9. event-time-scoped uniqueness rather than a separate global identity table;
10. per-reading database inserts at larger sustained rates.

## Minimum required changes

The requested validation should reuse the existing architecture and add only:

1. exact, test-enforced household-profile inventories;
2. exact stage populations for 100, 250, 500, and 1,000 assets;
3. stable device-hash scheduling over the reporting window;
4. one rotating primary semantic reading per asset for the functional cycle;
5. full-field coverage mode for the representative subset;
6. stage-specific source/run identity and semantic consumer group;
7. six-partition recommendation with explicit, non-destructive application;
8. profile filtering, bounded household search, and aggregate stage visibility;
9. incremental evidence, charts, screenshots, and measured sizing calculations;
10. reports that distinguish functional completion, sustained local
    performance, and modeled future scale-out.

## Audit conclusion

The codebase is structurally ready for a controlled 1,000-asset validation,
but that capability is not yet validated. The exact population, reduced
one-reading workload, isolated stage measurement, and staged execution must be
implemented and measured before any 1,000-asset claim is made.
