# Measured Million-Device Scale-Out Model

## Claim boundary

This is a capacity model derived from the measured local 1,000-asset
validation. It is not a completed 10,000-, 100,000-, or 1,000,000-asset
validation. It must be replaced with benchmarks from the selected production
Kafka, GPU inference, and database platforms before procurement or deployment.

## Measured baseline

The baseline run used one Windows laptop, one Kafka broker, one TimescaleDB
instance, one semantic worker, local Ollama, and `phi3:mini`.

| Measure | Observed value |
|---|---:|
| Assets / households | 1,000 / 100 |
| Reporting window | 600 seconds |
| Primary readings | 1,000 |
| Arrival rate | 1.666 readings/s |
| Durable semantic completion | 0.424 readings/s |
| SLM invocation | 100% |
| Accepted mappings | 96.9% |
| Safely unmapped | 3.1% |
| SLM latency p50 / p95 / p99 | 16.39 / 26.89 / 29.86 seconds |
| Maximum / final Kafka lag | 762 / 0 readings |
| Batch size average / maximum | 7.14 / 8 |
| GPU peak utilization / memory | 98% / 3,788 MiB |
| Generator maximum RSS | 74.57 MiB |
| Full run / backlog clearance | 2,382.6 / 1,757.4 seconds |

The measured durable rate was lower than arrival by a factor of 3.927.
Therefore the local result is an asynchronous functional pass, not evidence
of sustained real-time capacity at 1.666 readings/s.

## Workload formulas

For population `D`, reporting interval `I` seconds, and readings per update
`R`:

```text
telemetry_messages_per_second = D / I
semantic_readings_per_second = D * R / I
local_worker_capacity_equivalents =
  ceiling(semantic_readings_per_second / 0.424 * 1.30)
```

The 30% factor is a planning margin. A local-worker capacity equivalent is
not a GPU replica recommendation: vLLM and candidate production GPUs require
their own structured-output quality and throughput benchmark.

## Fifteen-minute reporting projection

| Assets | Messages/s | Readings/s at R=1 | Local-worker equivalents | Readings/s at R=3 | Local-worker equivalents |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 11.11 | 11.11 | 35 | 33.33 | 103 |
| 100,000 | 111.11 | 111.11 | 341 | 333.33 | 1,023 |
| 1,000,000 | 1,111.11 | 1,111.11 | 3,407 | 3,333.33 | 10,221 |

These deliberately conservative equivalents show why the laptop inference
profile cannot be extrapolated into a production topology. A production
vLLM pool must deliver a much higher validated-readings-per-GPU rate.

## Generator model

Across the 100- and 1,000-asset functional runs, generator RSS rose from
59.70 MiB to 74.57 MiB. The observed incremental slope is approximately
16.9 KiB per virtual asset, with a process baseline near 58 MiB. The measured
1,000-asset process generated 1.666 messages/s because the schedule was
deliberately rate-limited; this is not its saturation throughput.

Future load generators should use deterministic shards. A provisional
50,000-asset shard would require about 0.88 GiB from the measured memory
slope, before runtime and evidence-buffer margin. Generator count must be
selected by a separate saturation benchmark and capped by both memory and
network throughput.

## Kafka and processing topology

The following are initial validation profiles, not measured production
configurations:

| Assets | Initial brokers | Initial partitions per main topic | Normalization workers | Semantic capacity target |
|---:|---:|---:|---:|---:|
| 10,000 | 3 | 24-48 | 3-6 | benchmark to at least 14.45 validated readings/s |
| 100,000 | 6-9 | 96-192 | 12-24 | benchmark to at least 144.45 validated readings/s |
| 1,000,000 | 12+ regional | 384+ per regional topology | autoscaled | benchmark to at least 1,444.45 validated readings/s |

Capacity targets include the 30% planning margin for one reading per update
at a fifteen-minute interval. Partition count must also satisfy recovery-time
and rebalance tests. Replication factor three, cooperative rebalancing,
idempotent producers, durable manual offset completion, retry topics, and
dead-letter topics are required.

## Inference architecture

Use provider-independent semantic workers against GPU-backed vLLM inference
replicas. Preserve:

- one auditable SLM outcome per normalized reading;
- strict reading-ID reconciliation and structured output;
- deterministic SAREF4ENER validation without replacement mappings;
- bounded retries and explicit safely-unmapped terminal outcomes;
- worker, batch, request, model, and inference-server identities;
- autoscaling from queue age, lag, validated readings/s, and GPU saturation.

Before sizing replicas, benchmark candidate models and GPUs at batch sizes
8, 16, 32, and 64. A result counts only when structured output passes the
same validator used by this repository.

## Storage model

Current mixed-history Timescale hypertables occupy approximately:

| Data class | Total bytes | Rows | Approximate bytes/row |
|---|---:|---:|---:|
| Raw telemetry | 21,700,608 | 16,892 | 1,285 |
| Normalized telemetry | 74,809,344 | 56,693 | 1,320 |
| Semantic event | 8,781,824 | 3,259 | 2,695 |
| Mandatory SLM audit | 35,168,256 | 23,776 | 1,479 |
| IEEE-style event | 14,598,144 | 3,288 | 4,440 |

These include indexes, chunk allocation, and mixed workloads. They provide
an order-of-magnitude baseline, not a compression guarantee. At the measured
96.9% mapping rate, one update is roughly 11 KiB across these five durable
classes before retention compression.

| Assets at 15 minutes | Updates/day | Uncompressed order-of-magnitude/day |
|---:|---:|---:|
| 10,000 | 960,000 | 10.6 GB (9.8 GiB) |
| 100,000 | 9,600,000 | 105.6 GB (98.3 GiB) |
| 1,000,000 | 96,000,000 | 1.06 TB (0.96 TiB) |

Production design needs time/tenant partitioning, compressed hot retention,
separate aggregate tables, governed cold storage, tested restore, and
different retention policies for raw, semantic, and command audit data.

## Dashboard model

The 1,000-asset customer read layer returned a community aggregate in
1.25 seconds on average and a filtered 25-row device page in 0.96 seconds
on average during active inference. Larger deployments must continue to use:

- materialized or incrementally maintained aggregates;
- tenant- and household-scoped server queries;
- bounded date ranges and chart downsampling;
- pagination rather than complete device inventories;
- short-lived caching for non-sensitive aggregates;
- separate operational metrics from customer data.

## Scale-out sequence

1. Benchmark production candidate GPUs through the existing vLLM adapter.
2. Validate 10,000 assets with distributed generators, three Kafka brokers,
   and multiple inference replicas.
3. Validate broker loss, inference-pool loss, replay, and idempotency.
4. Advance to 100,000 assets only after backlog, durability, and cost gates.
5. Introduce regional ingestion and tenant partitions before the
   million-device-class test.
6. Validate disaster recovery, privacy, identity, consent, retention, and
   controlled rollout before real-device enablement.

The logical AD-FLEX business workflow remains unchanged; the data plane is
horizontally replicated around stable event identities and durable handoffs.
