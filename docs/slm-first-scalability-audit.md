# SLM-First Scalability Audit

## Audit Scope

This audit records the AD-FLEX implementation before the 10,000-device scalability work changes runtime behavior. It combines repository inspection with live Kafka, TimescaleDB, Docker, host, and Ollama observations collected on 20 July 2026.

The target workload is substantially larger than the previously validated five-household scenario. No 10,000-device support claim is made in this audit.

## Current Telemetry Flow

```text
HTTP client -> security-gateway -> ingestion-api -> raw.telemetry
MQTT client -> mqtt-broker -> mqtt-subscriber -> raw.telemetry
raw.telemetry -> engine -> normalized_telemetry -> normalized.telemetry
normalized.telemetry -> semantic-connector -> semantic_events -> semantic.enriched
semantic.enriched -> ieee20305-translator -> ieee20305_events -> ieee20305.translated
```

The security gateway enforces the local API key, request inspection, body limits, rate limiting, IP policy, correlation IDs, and security audit storage. The ingestion API validates each telemetry envelope and produces one Kafka message. The engine stores the raw payload, expands each telemetry field into a normalized row, stores each normalized row, and publishes one `normalized.telemetry` message per reading.

The downstream DSO and safety workflow remains:

```text
grid.signals -> aggregator -> dispatch.command.proposed
-> approval-workflow -> dispatch.command.ready
-> mock-dispatch-adapter and device-command-translator
-> simulated device APIs and audit storage
-> dataspace-export
```

All command paths remain simulated and preserve `no_real_execution=true`.

## Current Normalized-Reading Flow

The engine uses KafkaJS `eachMessage`. A valid telemetry message containing three to five readings becomes three to five independent normalized Kafka messages. Each normalized event includes event time, community, household, device identity, device type, reading name, numeric value, optional unit, protocol, source, and correlation ID.

There is currently no first-class `reading_id`. Identity is implicit in the combination of event time, device, reading name, and Kafka metadata. This is insufficient for durable idempotency during retries or consumer-group rebalances.

The semantic connector also uses KafkaJS `eachMessage`. It parses and validates one normalized message, performs one SLM request, validates the result, writes one database row, and publishes one semantic event before moving to the next message.

## Current Kafka Configuration

The live local broker is a single Kafka 7.6.1 broker with Zookeeper. Topic auto-creation is enabled. Replication factor is one.

Every application topic inspected live has one partition, including:

- `raw.telemetry`
- `normalized.telemetry`
- `semantic.enriched`
- `ieee20305.translated`
- `grid.signals`
- dispatch, device command, security audit, and dataspace topics

The live semantic consumer group is `saref4ener-semantic-connector`. It has one member consuming partition zero of `normalized.telemetry`. Observed lag was zero at idle. A second semantic worker could join the group, but one source partition means only one worker could receive data.

The engine and semantic producers use identity-derived keys, but a one-partition topic prevents useful distribution. There are no configured retry or dead-letter topics for semantic mapping.

## Current Semantic Consumer Configuration

The connector uses:

- client ID `adflex-semantic-connector`
- group ID `saref4ener-semantic-connector`
- session timeout at least the SLM timeout plus 30 seconds, currently 120 seconds
- heartbeat interval 3 seconds
- KafkaJS `eachMessage`
- one running container with a fixed `container_name`
- default KafkaJS automatic offset management

The handler catches processing failures and logs them. Because failures are not consistently propagated to Kafka and there is no durable retry record, an invalid or failed reading can be skipped while the consumer continues. This is incompatible with the requirement that no reading be silently dropped.

## Current SLM Request Pattern

For each normalized reading, the connector builds an individual natural-language prompt and sends `POST /api/generate` to Ollama. The request uses:

- model `phi3:mini`
- JSON output mode
- non-streaming response
- temperature `0.1`
- one HTTP request per reading
- one output mapping per request

The prompt contains the reading context, allowed concepts and units, canonical examples, safety instructions, and an eight-field output object. It explicitly prohibits commands, device control, credentials, URLs, and executable actions.

The current output fields are:

- `saref_type`
- `saref_property`
- `saref_unit`
- `saref4ener_concept`
- `ngsi_type`
- `ngsi_property`
- `mapping_confidence`
- short free-form `explanation`

The output does not include a reading ID. Consequently, a batched response cannot yet be reconciled independently to input readings.

## Current Ollama Configuration

The configured base URL inside Docker is `http://host.docker.internal:11434`. Both `SLM_MODEL` and `OLLAMA_MODEL` default to `phi3:mini`. The timeout defaults to 30 seconds and minimum accepted confidence defaults to `medium`.

Live inspection found:

- Ollama installed and reachable on the host
- `phi3:mini` present locally, approximately 2.2 GB
- `phi3:latest` also present and resolving to the same local model ID
- no model loaded at the instant `ollama ps` was sampled

The current adapter has no explicit model warm-up, connection pool, provider abstraction, concurrency limiter, circuit breaker, or inference metrics.

## Current Validation, Timeout, And Retry Behavior

SLM output is parsed as strict JSON and validated for exact fields, string types, confidence, safe text, allowed concepts, allowed unit aliases, NGSI naming, command-like content, identity injection, and deterministic unit/property consistency for known readings.

The current behavior falls back to deterministic SAREF4ENER mappings when the SLM is disabled, unavailable, timed out, invalid, low confidence, or inconsistent. Unknown readings can become `unmapped`.

This deterministic replacement behavior does not meet the new mandatory-SLM contract. Under the new contract deterministic logic may validate, reject, request an SLM retry, or mark a reading safely unmapped, but must not synthesize a successful replacement mapping.

There is currently one request timeout and no SLM retry loop. The Ollama adapter converts transport, timeout, HTTP, response-shape, and JSON failures to `null`, which loses the specific failure category.

## Current Idempotency Behavior

Neither `normalized_telemetry` nor `semantic_events` has a stable reading ID or a unique constraint that prevents repeated durable processing. `semantic_events` uses `(event_time, id)` as its TimescaleDB primary key, where `id` is generated on insert.

The semantic insert is a plain `INSERT` with no `ON CONFLICT` behavior. A consumer replay, offset reset, or rebalance after a completed insert and before offset commit can create a duplicate semantic row and a duplicate `semantic.enriched` message.

The IEEE 2030.5-style storage path similarly lacks a normalized-reading idempotency key, so duplicate semantic events can propagate into duplicate IEEE rows.

## Current Database-Write Strategy

The engine performs individual SQL writes for raw and normalized rows. The semantic connector uses a PostgreSQL pool with a default maximum of ten connections but performs one insert per reading, serially from the consumer handler.

`semantic_events` stores mapping metadata and an embedded JSON semantic payload. Some SLM audit fields are embedded in `semantic_payload.slm_audit`; they are not complete enough to prove every mandatory inference attempt and are not independently indexed.

There is no batch insert, explicit database transaction linking semantic persistence to an audit record, durable retry record, or per-reading insert latency metric.

## Current Dashboard Query Behavior

The customer console calls Next.js API routes, which call only the security gateway. The gateway platform-status query reads aggregate table counts plus bounded recent-record lists. Current SQL queries generally use limits between five and twenty rows.

This is safer than loading every device into the browser, but the current dashboard does not expose semantic queue depth, Kafka lag, batch sizes, inference latency percentiles, retry/unmapped rates, duplicate counts, or staged scalability progress. Some aggregate queries count entire hypertables on request; those should be replaced or supplemented with bounded time-window metrics for larger runs.

## Measured Baseline And Resource Envelope

Host and Docker observations:

| Resource | Observed value |
| --- | --- |
| CPU | Intel Core i9-13900HX, 24 cores / 32 logical processors |
| Host RAM | approximately 16 GB |
| Docker Desktop RAM | approximately 7.62 GiB usable |
| GPU | NVIDIA RTX 4070 Laptop GPU, 8,188 MiB |
| Kafka | one broker, one partition per application topic, replication factor one |
| Semantic workers | one |
| Ollama model | `phi3:mini`, 2.2 GB local image |

The previous five-household validation processed 30 telemetry messages and 120 normalized readings. Its measured completed reading throughput was approximately `0.531 readings/s`, with maximum end-to-end latency approximately 222 seconds while inference was serial.

The 10,000-device target at one telemetry update every 60 seconds is approximately `166.67 telemetry messages/s`. At three to five readings per message, the semantic arrival rate is approximately `500-833 readings/s`. Relative to the prior measured rate, the target is roughly 942 to 1,569 times higher. Micro-batching may reduce prompt overhead substantially, but it cannot be assumed to close this gap without staged measurements and likely multiple inference replicas.

## Current Throughput Bottlenecks

1. One `normalized.telemetry` partition caps active semantic consumption at one worker.
2. One Ollama request is made for every reading.
3. Inference calls are serial inside `eachMessage`.
4. The prompt repeats large instructions and examples for every reading.
5. There is no provider concurrency, pooling, warm-up, or circuit breaker.
6. Every semantic row is inserted individually.
7. There is no stable reading ID, so retry and replay cannot be made safely idempotent.
8. There is no retry/DLQ path or durable failed-reading state.
9. Fixed container naming prevents normal Compose replica scaling.
10. Consumer lag and inference latency are not exposed as operational metrics.
11. Local Docker memory is limited to about 8 GB, constraining many worker replicas.
12. One local Phi-3 Mini instance may serialize GPU work even if HTTP concurrency is increased.

## Risks Moving From 15 To 10,000 Devices

- **Unbounded semantic backlog:** target arrival can exceed local inference capacity by orders of magnitude.
- **Kafka session instability:** long in-handler inference can delay heartbeats and trigger rebalances.
- **Duplicate durable rows:** replay after partial completion has no idempotency boundary.
- **Silent loss:** caught errors can advance processing without durable retry evidence.
- **Incomplete batch output:** a model can omit, duplicate, or invent reading IDs.
- **Prompt/context overflow:** 128 readings may exceed practical model context or output limits depending on field lengths.
- **GPU memory pressure:** Phi-3 Mini plus concurrent contexts can exceed the available 8 GB GPU memory.
- **Docker memory pressure:** Kafka, TimescaleDB, services, generators, and inference clients share an 8 GB Docker limit.
- **Database contention:** per-row inserts and broad count queries become increasingly expensive.
- **Downstream amplification:** each normalized reading produces semantic and IEEE records, increasing write and Kafka volume.
- **Misleading acceptance metrics:** a successful gateway response or Kafka publish does not prove semantic, IEEE, and durable completion.
- **Dashboard overload:** per-device live rendering does not scale to 10,000 records.

## Audit Conclusion

The current architecture is functionally complete for small local demonstrations but is not configured or measured for 10,000 devices. The semantic path is the limiting stage. The redesign must add stable reading identity, strict batch reconciliation, mandatory SLM evidence, bounded queues, provider abstraction, idempotent durable writes, retry/DLQ handling, partitioning, multi-worker support, and aggregate metrics before a staged capacity claim can be evaluated.

The audit is now complete. Runtime behavior changes may proceed under the staged validation gates.
