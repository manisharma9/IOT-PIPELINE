# 1,000-Asset Local Validation: Client Summary

## Outcome

AD-FLEX has completed a controlled local functional validation with exactly
100 simulated households and 1,000 simulated energy assets. The test used
the existing security, telemetry, semantic, grid, flexibility, mock-dispatch,
device-translation, dataspace, and customer-dashboard workflow.

The result is a **functional end-to-end pass**. It proves that the complete
workflow can accept, process, audit, store, display, and safely complete the
configured population on the local demonstration environment.

It is not a sustained production real-time capacity claim. The local
Phi-3 Mini inference tier completed 0.424 readings per second while the
10-minute population schedule arrived at 1.666 readings per second. Kafka
retained the backlog and the pipeline cleared it after generation stopped.

## Population validated

| Household profile | Households | Assets |
|---|---:|---:|
| Apartment | 30 | 240 |
| Standard home | 50 | 500 |
| Prosumer home | 20 | 260 |
| **Total** | **100** | **1,000** |

The population included smart meters, smart plugs, refrigerators, washing
machines, lighting circuits, water heaters, thermostats/HVAC, dishwashers,
heat pumps, EV chargers, solar inverters, and home batteries.

## Verified results

| Measure | Result |
|---|---:|
| Telemetry updates accepted | 1,000 / 1,000 |
| Normalized semantic readings | 1,000 |
| Readings submitted to local SLM | 1,000 (100%) |
| SLM mappings accepted | 969 (96.9%) |
| Explicit safely-unmapped outcomes | 31 (3.1%) |
| Semantic / IEEE-style rows | 969 / 969 |
| Silent drops | 0 |
| Duplicate final semantic / IEEE rows | 0 / 0 |
| Processing errors | 0 |
| Maximum / final Kafka lag | 762 / 0 |
| Unsafe execution rows | 0 |

Every reading reached Phi-3 Mini through local Ollama. Deterministic
SAREF4ENER logic validated the model output and did not create a replacement
mapping when an output failed. Rejected outputs were retried and then stored
as explicit safely-unmapped terminal records.

## Complete business workflow

The validation also completed representative DSO requests for five
households from each profile. Proposals moved through review, approval, and
ready status. Mock dispatch and simulated device-command translation ran
with `no_real_execution=true`. Privacy-aware dataspace exports applied
pseudonymization and minimization.

No physical household device was controlled.

## Customer visibility

The customer console now shows the exact 100-household/1,000-asset cohort,
profile and category distributions, online/flexible asset counts, current
bounded demand, data-readiness progress, household search, and paginated
device inventory.

The browser does not load 1,000 device cards. Community summaries are
aggregated server-side and device lists are household-scoped and paginated.
Technical inference and Kafka diagnostics remain in the protected operations
dashboard.

## Additional measured checks

A separate semantic-coverage run exercised all 12 device categories and 374
multi-field readings. Every reading called Phi-3 Mini; 339 validated mappings
were accepted and 35 were explicitly stored as safely unmapped. There were no
drops, duplicate final rows, processing errors, or remaining Kafka backlog.

A 15-minute 1,000-asset arrival test also completed all 1,000 readings with
100% SLM invocation, zero loss, zero duplicates, and final Kafka lag zero.
Its measured arrival rate was 1.102 readings/s and completion rate was 0.445
readings/s, so its classification is **functional only**. It is not presented
as a sustained local real-time pass. Backlog clearance after generation took
1,345.714 seconds, and the measured inference-capacity shortfall was 2.478x.

## Principal finding

The local GPU inference tier is the bottleneck. Kafka, TimescaleDB, the
gateway, and the simulator remained operational and preserved the backlog,
but one local Phi-3 Mini worker cannot sustain the tested 1.666 readings/s.

Home-battery state-of-charge interpretation is the main semantic quality
gap: 19 of 20 such readings were safely rejected by strict validation. This
requires model/prompt evaluation before a larger controlled validation.

## What this supports

- A credible 1,000-asset local functional demonstration.
- Auditable mandatory SLM processing for every reading.
- Safe asynchronous completion without silent loss.
- A measured baseline for a production vLLM/GPU benchmark.
- Horizontal scale-out without rewriting the logical AD-FLEX workflow.

## What this does not claim

- One-million-device validation.
- Sustained production real-time performance.
- High availability or disaster recovery.
- Certified IEEE 2030.5, ENERSHARE, or IDS integration.
- Real-device control, real credentials, or customer consent readiness.

The measured infrastructure model and future architecture are documented in
`docs/million-device-scale-out-model.md` and
`docs/million-device-infrastructure-roadmap.md`.
