# 10,000-Device Workload Definition

## Purpose

This workload defines a controlled production-style capacity validation. It is not a claim that 10,000 devices are already supported, and it is not a maximum-capacity benchmark.

The workload is reproducible, configurable, and gated. The 100, 1,000, 5,000, and 10,000-device stages must be evaluated in order. A stage with unresolved drops, duplicates, processing errors, database failures, missing SLM evidence, or unbounded lag blocks progression to the next stage.

## Default Population

| Setting | Default |
| --- | ---: |
| Devices | 10,000 |
| Households | 3,334 |
| Approximate devices per household | 3 |
| Shelly Plug share | 34% |
| Enode / Easee EV charger share | 33% |
| Heat pump share | 33% |
| Reporting interval | 60 seconds |
| Test duration | 30 minutes |
| Ramp-up | 300 seconds |
| Burst allowance | 10% |
| Random seed | 20,305 |

Households receive devices by seeded round-robin assignment. The final household can contain fewer devices when the exact device count is not divisible by the configured household count. Every virtual device has independent state and timing jitter.

## Expected Rates

At 10,000 devices and a 60-second interval:

```text
telemetry arrival rate = 10,000 / 60 = 166.67 messages/s
```

Each telemetry message contains three to five readings:

```text
minimum semantic rate = 166.67 * 3 = 500 readings/s
maximum semantic rate = 166.67 * 5 = 833.35 readings/s
```

The target rate can be overridden directly. Direct rate configuration takes precedence over the interval-derived rate and is recorded in evidence.

## Device Behavior

### Shelly Plug

Readings include active power, voltage, current, and cumulative energy. Power changes with a seeded load state; voltage drifts within a realistic local range; current follows power and voltage; energy increases monotonically.

### Enode / Easee EV Charger

Readings include charging state encoded as a numeric state, charging power, cumulative delivered energy, and optional state of charge. Charging sessions and power limits vary independently by device.

### Heat Pump

Readings include room temperature, target temperature, operating mode encoded as a numeric state, and power usage. Thermal state changes gradually according to ambient drift and operating mode.

## Identity Requirements

Every generated message has unique or stable identity fields as appropriate:

- stable household ID
- stable device ID
- unique message ID
- unique reading ID for each field occurrence
- source timestamp
- correlation ID

Reading IDs are derived from scenario, cycle, device, field, and timestamp identity. They are carried through normalization and semantic processing to support idempotent persistence and duplicate detection.

## Modes

- **steady:** hold the configured target rate for the full test.
- **ramp:** increase linearly from a low initial rate to target rate during ramp-up, then hold.
- **burst:** run at target rate with seeded short bursts up to the configured burst percentage.
- **soak:** steady operation for an extended duration with periodic resource and lag sampling.

All modes use a bounded in-flight request pool. Completed history is streamed incrementally to disk instead of retained in memory.

## Configuration Contract

The reference configuration is `config/scalability-10000.example.json`. Command-line arguments may override:

- device count
- household count
- devices per household
- device-type distribution
- reporting interval
- duration
- random seed
- ramp-up duration
- burst percentage
- cycles
- target telemetry rate
- maximum permitted semantic backlog
- output location

The PowerShell entry point is designed for:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-scale-validation.ps1 -Devices 10000 -IntervalSeconds 60 -DurationMinutes 30
```

## Evidence Contract

Each run creates a timestamped directory containing:

- resolved configuration
- generator JSONL event stream
- periodic resource samples
- Kafka offsets and consumer lag samples
- database count and latency samples
- SLM batch and reading outcome metrics
- final JSON result
- final CSV summary
- throughput, latency, lag, and mapping-outcome charts
- dashboard screenshots when the dashboard is available

The generator records gateway acceptance separately from end-to-end completion. A message is successful only when all expected normalized readings have explicit final semantic outcomes and required durable downstream evidence.

## Backpressure And Stop Conditions

Generation pauses or fails safely when:

- in-flight HTTP work reaches the configured bound
- observed semantic backlog exceeds the configured maximum
- the gateway becomes persistently unavailable
- evidence output cannot be written
- the process receives a shutdown signal

The run does not silently discard readings. Generation failures and end-to-end failures are separate counters.

## Stage Gates

| Stage | Devices | Purpose |
| --- | ---: | --- |
| 1 | 100 | Verify correctness, mandatory SLM evidence, and basic batching. |
| 2 | 1,000 | Verify partition distribution, concurrency, and bounded lag. |
| 3 | 5,000 | Verify sustained inference and database behavior. |
| 4 | 10,000 | Evaluate the requested controlled target under measured hardware. |

The next stage is not run as a passing validation while the previous stage has unresolved drops, duplicates, missing SLM evidence, unbounded lag, failed inserts, or processing errors. A short generator-only dry run may still be used to verify memory behavior, but it is not an end-to-end capacity result.

## Pass Definition

The final stage passes only when all 10,000 unique devices generate their configured updates, all normalized readings record `slm_called=true`, all readings have an auditable SLM response or explicit failure state, no records are silently dropped, no duplicate final semantic or IEEE rows exist, database writes complete, lag remains bounded and returns to zero, the safe approval/mock-dispatch path completes, dataspace export completes, the dashboard stays responsive, and `no_real_execution=true` remains enforced.

If the local hardware cannot sustain the workload, the result is a measured capacity limit rather than a failure hidden behind queue acceptance. The report will state the maximum sustainable device count and reading rate, the exact bottleneck, the improvement factor, and the estimated inference replica and hardware requirements for a later run.
