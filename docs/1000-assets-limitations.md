# 1,000-Asset Validation Limitations

## Claim Boundary

This work validates a controlled local population of up to 1,000 simulated
assets only when the corresponding measured stage passes. It does not prove
one-million-device capacity, production real-time service levels, certified
IEEE 2030.5 compliance, or certified ENERSHARE/IDS integration.

## Local Inference

Phi-3 Mini runs through Ollama on one laptop GPU. Preflight measurements
show that inference is the dominant bottleneck. Batch size 8 was more
reliable than 16, 32, or 64; larger batches produced more validator
rejections. A local functional test may therefore finish asynchronously
after message generation stops.

## Simulation

All household assets are simulated. The approval and dispatch path remains
mock-only, and all device-command evidence must preserve
`no_real_execution=true`. No real credentials, customer consent system, or
physical control integration is included.

## Single-Node Infrastructure

Kafka uses one broker and TimescaleDB uses one local instance. This setup is
appropriate for functional validation but does not test broker failover,
database high availability, regional recovery, or production identity.

## Semantic Outcomes

The SLM is mandatory, but a strict validator may reject a proposal. Such a
reading is retried and then stored as an explicit safely-unmapped terminal
outcome. It is not silently dropped and does not receive a deterministic
replacement mapping.

The measured population run accepted 969 of 1,000 SLM proposals. Nineteen
of twenty home-battery state-of-charge readings were safely unmapped because
Phi-3 Mini did not consistently produce a validator-compatible
property/unit relationship. This is a visible model-quality gap, not a
transport or storage loss.

## Flexibility Targeting

The representative workflow records five households from each profile as
audited test context. The current DSO signal and aggregator contract remains
community scoped, so that cohort list is not yet an enforced household-level
dispatch boundary. Production targeting requires an authorized target-group
contract before any real control work.

## Dashboard

The customer console uses server-side aggregation, bounded queries, and
pagination. It is not a high-frequency observability system, and technical
diagnostics remain in the internal operations route.

## Future Modeling

Infrastructure estimates for 10,000, 100,000, and 1,000,000 assets are
projections derived from measured local rates. They are not completed
validations and require distributed ingestion, multi-broker streaming,
GPU-backed inference pools, partitioned storage, and production
observability before deployment claims can be made.

The measured local inference completion rate is approximately 0.424 readings
per second. This is the dominant limit; a production GPU/vLLM benchmark is
required before inference-replica counts can be selected.

The separate 15-minute sustained-arrival run measured 0.445 readings/s
completion against 1.102 readings/s arrival and therefore classified the
local result as `functional_only`. Its backlog cleared after generation, but
the run does not establish a sustained local real-time capacity claim.
