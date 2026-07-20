# 10,000-Device Validation Plan

## Purpose

This plan defines a controlled scalability validation for the AD-FLEX mandatory SLM-first semantic path. It separates three claims that must not be conflated:

1. the virtual-device generator can represent a population;
2. Kafka can accept and buffer a workload;
3. every reading can complete inference, validation, durable storage, and downstream processing at the sustained arrival rate.

Only the third claim constitutes an end-to-end capacity pass.

## Workload

The target workload is 10,000 devices across approximately 3,334 households. The default mix is 34% Shelly Plug, 33% Enode / Easee EV charger, and 33% heat pump. Each device reports once per 60 seconds with three to five readings, producing approximately 167 telemetry messages and 500-850 normalized readings per second.

The canonical configuration is [scalability-10000.example.json](../config/scalability-10000.example.json). A fixed seed makes the device population and changing values reproducible. The generator streams evidence to JSON Lines files rather than retaining event history in memory.

## Staged Gates

| Stage | Devices | Recommended partitions | Worker profile | Advancement rule |
|---|---:|---:|---:|---|
| 1 | 100 | 3 | 1-2 | All pass criteria must be satisfied |
| 2 | 1,000 | 6 | 2-4 | Stage 1 must pass first |
| 3 | 5,000 | 12 | 4-8 | Stage 2 must pass first |
| 4 | 10,000 | 24 | 8+ and scalable inference | Stage 3 must pass first |

Partition changes are explicit because Kafka partition counts cannot be reduced in place:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-scalability-topics.ps1 -Devices 100
powershell -ExecutionPolicy Bypass -File .\scripts\configure-scalability-topics.ps1 -Devices 100 -Apply
```

## Pass Criteria

A stage passes only when all of the following are measured:

- every configured device is represented;
- every generated update is accepted and normalized;
- every normalized reading has a terminal `semantic_slm_audit` row;
- `slm_called=true` for 100% of normalized readings;
- each reading has either a validated SLM mapping or an explicit safely-unmapped state;
- there are no duplicate durable audit, semantic, or IEEE rows;
- no processing or database-insert errors occur;
- Kafka lag stays within the configured bound and returns to zero;
- semantic completion throughput meets sustained arrival throughput;
- approval, mock dispatch, and dataspace export complete;
- `no_real_execution=true` remains enforced.

Queue acceptance alone is never a pass. A timeout or safely-unmapped result is auditable, but a high safely-unmapped rate is a semantic-quality limitation.

## Reproduction

Start the stack and inspect the 100-device topic recommendation:

```powershell
docker compose up -d
powershell -ExecutionPolicy Bypass -File .\scripts\configure-scalability-topics.ps1 -Devices 100
```

Run the first measured gate:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-scale-stage.ps1 `
  -Devices 100 -Households 34 -IntervalSeconds 60 -DurationMinutes 1 -Cycles 1
```

Run the requested 30-minute target only after the earlier gates pass:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-scale-validation.ps1 `
  -Devices 10000 -Households 3334 -IntervalSeconds 60 -DurationMinutes 30
```

Results are written beneath `docs/scalability-results/<run-id>/` as generator JSONL, resource JSONL, pipeline samples, JSON result, and CSV summary.

## Stop Conditions

Testing stops before the next stage if the current stage has drops, duplicates, missing SLM evidence, processing errors, unbounded lag, failed inserts, or insufficient sustained throughput. The report must then state the measured bottleneck, sustainable rate, required improvement factor, and recommended inference topology.

