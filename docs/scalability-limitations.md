# Scalability Limitations

## Local Validation Boundary

- The local deployment uses one Kafka broker, one TimescaleDB instance, and one consumer group in Docker Desktop.
- The reference inference server is one local Ollama Phi-3 Mini process. It is not representative of a multi-GPU serving tier.
- Kafka replication factor is one, so broker fault tolerance is not validated.
- Docker Desktop resource limits and Windows host scheduling affect latency.
- Short stage tests characterize the current machine; they do not establish production service-level objectives.

## Semantic Quality

Strict guardrails intentionally reject plausible-looking but inconsistent SLM output. A reading can therefore complete safely without producing a semantic event. Reports must show mapped, retried, invalid-output, missing-output, and safely-unmapped rates separately.

## Capacity Claims

Representing 10,000 virtual devices does not prove end-to-end support. Accepting messages into Kafka does not prove semantic completion. A capacity claim requires 100% SLM-call evidence, no silent drops, no duplicate final rows, bounded lag that returns to zero, durable database completion, and sustained completion throughput at least equal to arrival throughput.

## Operational Gaps

- No multi-broker Kafka or cross-zone recovery is implemented locally.
- No production vLLM cluster, GPU autoscaling, or model-routing service is deployed.
- Database write batching can be improved further for very high rates.
- Metrics are exposed through aggregate gateway queries rather than a dedicated Prometheus/OpenTelemetry stack.
- API keys and simulated device connectors remain local-development controls.
- There is no certified IEEE 2030.5 or ENERSHARE/IDS connector.
- No real household device command is executed.

