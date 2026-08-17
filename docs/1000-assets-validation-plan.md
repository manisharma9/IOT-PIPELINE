# 1,000-Asset Validation Plan

## Environment

- Windows laptop and Docker Desktop
- local Kafka and ZooKeeper
- local TimescaleDB/PostgreSQL
- local Ollama with `phi3:mini`
- one bounded JavaScript fleet generator
- no paid or hosted infrastructure

Hardware and active container resource samples are captured in every run.

## Preflight

1. Validate Compose.
2. Confirm Ollama and `phi3:mini`.
3. Stop the continuously running demo fleet to isolate the cohort.
4. Apply additive database migrations 013 and 014.
5. Start a fresh semantic consumer group from the current topic end.
6. Benchmark batch sizes 8, 16, 32, and 64.
7. Select the best stable local configuration.

The preflight selected batch size 8. Larger batches reduced strict mapping
quality on the local Phi-3 Mini model.

## Stage Gates

Stages run in order: 100, 250, 500, then 1,000 assets. A stage fails when
any of these conditions is false:

- exact household and asset representation;
- every gateway message accepted;
- no generator drops;
- every reading normalized;
- every reading has a terminal SLM audit;
- `slm_called=true` for every reading;
- every reading is mapped or explicitly safely unmapped;
- every mapped reading reaches IEEE-style storage;
- no duplicate normalized, audit, semantic, or IEEE reading IDs;
- no processing or database errors;
- measured Kafka lag remains bounded and returns to zero;
- the semantic container remains on the isolated validation consumer group
  for the complete run;
- approval, mock dispatch, and device command audit complete;
- all execution evidence retains the simulation-only safety flags;
- minimized, pseudonymized dataspace export completes.

Queue acceptance alone is never a pass.

The PowerShell stage wrapper stops only the continuous demo fleet before a
measured run and verifies the semantic container's consumer group. The Node
runner repeats that check at start and completion. A concurrent service
recreation therefore fails the run instead of producing contaminated
evidence.

## Evidence

Each run directory includes:

- resolved configuration;
- deterministic population summary and streamed inventory;
- streamed gateway events;
- generator resources;
- pipeline and Kafka-lag samples;
- final result JSON;
- CSV summary.

Post-processing creates charts and a cross-stage summary. Dashboard
screenshots are captured after the final population is registered.

## Classifications

- `functional_end_to_end_pass`: all durable functional gates pass.
- `sustained_local_pass`: all gates pass and completion throughput is at
  least the sustained arrival rate without unbounded lag.
- `functional_only`: functional completion passes, but the local processing
  rate does not keep up with the tested sustained arrival rate.
- `failed`: one or more mandatory gates fail.

## Reproduction

```powershell
$env:EDGE_API_KEY = "<value from local .env>"
powershell -ExecutionPolicy Bypass -File .\scripts\run-1000-assets-stage.ps1 `
  -Assets 100 -ReportingWindowSeconds 600 -IntervalSeconds 600
```

Later stages change `-Assets` to `250`, `500`, and `1000`. Topic partition
recommendations are inspected with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-scalability-topics.ps1 -Devices 1000
```

Partition increases occur only when `-Apply` is explicitly supplied.
