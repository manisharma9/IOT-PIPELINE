# Million-Device Scalability Roadmap

This is an architecture roadmap, not a completed validation or capacity claim.

## Ingestion And Generation

Use distributed load generators with disjoint deterministic device ranges and synchronized stage control. Deploy stateless gateway and ingestion replicas across availability zones. Apply per-tenant authentication, quotas, schema governance, and idempotency keys before accepting regional traffic.

## Kafka Digital Spine

Move from the single local broker to a multi-broker cluster with replication, rack awareness, capacity monitoring, and tested recovery. Increase partitions based on measured per-partition throughput and rebalance time. Maintain household or device affinity, retry and dead-letter retention, bounded lag alerts, and backpressure policies.

## Semantic Inference

Run stateless semantic worker pools against multiple vLLM inference replicas. Use GPU-aware scheduling, model warm pools, request routing, autoscaling on queue depth and token throughput, and admission control. Preserve reading-level structured output and deterministic validation. Scale tests must measure useful validated mappings per second, not only generated tokens.

## Storage

Partition data by region, tenant, and time. Apply Timescale retention and compression, separate hot operational data from long-term analytical storage, batch database writes, and use read replicas or materialized aggregates for dashboards. Test backup, restore, disaster recovery, and cross-region recovery objectives.

## Observability And Operations

Export OpenTelemetry traces, Kafka lag, inference queue time, token throughput, GPU utilization, database latency, retry and safely-unmapped rates, and end-to-end percentiles. Establish service-level objectives and automated rollback gates. Use aggregated dashboard queries; never stream one million device cards to a browser.

## Governance, Security, And Cost

Use production identity, mTLS, key rotation, consent and authorization policies, data minimization, regional residency controls, audit retention, and incident response. Add GPU quotas, batch-efficiency targets, cost per million readings, tiered retention, and capacity reservations.

## Validation Sequence

Advance through 10,000, 25,000, 100,000, and larger populations only after the prior stage clears all durability, lag, inference, latency, and safety gates. Million-device capacity remains unvalidated until a complete measured deployment demonstrates it.

