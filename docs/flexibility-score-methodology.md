# Household Flexibility Score Methodology

## Purpose

The Household Flexibility Score summarizes how much simulated household demand
is currently eligible for flexibility and how reliably prior simulated events
completed. It is an explainable readiness indicator, not a financial,
environmental, or contractual score.

## Data Sufficiency

The score is returned only when all of these conditions are met:

- at least two connected devices are represented
- at least one device is eligible for flexibility
- at least one flexibility event exists

When these conditions are not met, the API and UI return:

> Not enough data yet

No default or random score is shown.

## Formula

The score is the sum of five bounded components:

| Component | Maximum | Formula |
| --- | ---: | --- |
| Controllable load | 30 | `min(flexible_load_kw / current_power_kw, 1) * 30` |
| Device availability | 25 | `min(eligible_devices / total_devices, 1) * 25` |
| EV flexibility | 15 | 15 when an EV charger is represented, otherwise 0 |
| Heat-pump flexibility | 15 | 15 when a heat pump is represented, otherwise 0 |
| Simulation reliability | 15 | `min(successful_simulated_events / events, 1) * 15` |

The total is rounded to the nearest whole number and remains between 0 and
100. Each component is returned to the UI so the result can be explained.

## Source Data

- current power and eligible devices:
  `customer_device_latest_state`
- device types: latest normalized telemetry
- event count: `dispatch_commands`
- successful simulated outcomes: `dispatch_execution_audit`
- safety constraint: only `no_real_execution = true` outcomes qualify

## Excluded Claims

The score does not include:

- tariff or financial savings
- carbon emissions or avoided carbon
- real customer comfort
- real device response
- real export capacity
- contractual availability

These require production integrations and supporting datasets that are not
part of the current local foundation.

## Interpretation

A higher score means the local simulated data shows more controllable demand,
more eligible devices, and stronger simulated event completion. It does not
guarantee physical response or future performance.

