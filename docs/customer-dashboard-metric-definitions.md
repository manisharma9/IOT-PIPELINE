# Customer Dashboard Metric Definitions

## General Rules

- Storage timestamps are UTC.
- API timestamps use ISO 8601 UTC.
- The UI formats time in the browser's local time zone.
- A custom analytics range is limited to 31 days.
- Direct simulator readings are labelled measured.
- Values integrated or inferred from sampled power are labelled estimated.
- Simulated command outcomes are never labelled physical execution.

## Overview Metrics

### Live household consumption

- Source: `normalized_telemetry`
- Fields: `reading_value`, `reading_name`, `device_id`, `event_time`
- Eligible readings: `active_power_kw`, `ev_charging_power_kw`,
  `heat_pump_power_kw`
- Formula: latest eligible power reading per device, summed in kW
- Freshness: latest read, refreshed every 30 seconds
- Fallback: unavailable when no eligible readings exist
- Quality: measured simulated telemetry
- Privacy: household private

### Energy used today

- Source: `customer_device_daily_energy`
- Metered fields: `energy_import_kwh`, `energy_delivered_kwh`
- Estimated fields: eligible power readings
- Formula:
  - cumulative meter contribution = daily maximum minus daily minimum
  - power-only contribution = sum of 15-minute average kW multiplied by
    0.25 hours
- Refresh: 15 minutes
- Fallback: unavailable with no daily samples
- Quality: `measured`, `partly_estimated`, or `estimated`
- Privacy: household private

### Active devices

- Source: `customer_device_latest_state`
- Formula: devices with a last-seen timestamp within 10 minutes
- Refresh: 30 seconds
- Fallback: zero with a visible stale-data state
- Quality: observed connectivity
- Privacy: household private

### Flexible load available

- Source: `customer_device_latest_state`
- Eligible types: `shelly_plug`, `ev_charger`, `heat_pump`
- Formula: sum of non-negative current power for eligible, recently seen
  devices
- Refresh: 30 seconds
- Fallback: unavailable without eligible current-power data
- Quality: estimated opportunity, not a device commitment
- Privacy: household private

### Current grid event

- Source: `dispatch_commands`
- Fields: `status`, `start_time`, `end_time`, `target_kw`, `priority`
- Formula: latest event in the selected household or community whose end time
  has not passed
- Refresh: 30 seconds
- Fallback: "No active event"
- Quality: workflow record
- Privacy: household/community restricted

### Simulated energy shifted

- Source: `dispatch_commands`, `device_command_audit`
- Formula: allocated reduction kW multiplied by event duration in hours
- Inclusion: only simulated commands with `no_real_execution = true`
- Refresh: after event workflow updates
- Fallback: unavailable without allocation and duration
- Quality: simulated estimate
- Privacy: household/community restricted

## Analytics Metrics

### Household power series

- Source: `customer_household_power_15m`
- Formula: per-device average power in each bucket, then sum across devices
- Buckets:
  - 24 hours: 15 minutes
  - 7 days: 1 hour
  - 30 or 31 days: 6 hours
- Maximum response: 500 points
- Quality: measured simulated telemetry, downsampled
- Privacy: household private

### Device contribution series

- Source: `customer_household_power_15m`
- Formula: same aggregation grouped into smart plug, EV charger, and heat pump
- Quality: measured simulated telemetry, downsampled
- Privacy: household private

### Flexibility overlay

- Source: `dispatch_commands`
- Fields: start, end, target kW, status
- Formula: bounded events intersecting the selected chart range
- Quality: workflow record
- Privacy: household/community restricted

## Device Metrics

### Current power

- Source: `customer_device_latest_state`
- Formula: latest power reading appropriate to the device type
- Quality: measured simulated telemetry

### Energy today

- Source: `customer_device_daily_energy`
- Formula: cumulative delta when available; otherwise bounded power estimate
- Quality: measured or estimated per row

### Operating state

- Source: `charging_state_code`, `operating_mode_code`, and latest simulated
  command
- Translation:
  - EV: `0` paused, `1` charging, `2` reduced
  - heat pump: `1` heating, `2` reduced, `3` boost
  - Shelly: inferred from power and latest simulated action
- Fallback: "Status unavailable"

### Flexibility availability

- Source: device type, data freshness, and current power
- Formula: eligible type, seen within 10 minutes, and current power above zero
- Quality: estimated

## Flexibility Metrics

### Requested reduction

- Source: `dispatch_commands.target_kw`
- Quality: DSO workflow request

### Suggested device contribution

- Source: `device_command_audit.allocated_reduction_kw`
- Quality: simulated allocation

### Event status

- Source: dispatch, approval, mock, and device-command tables
- Customer labels:
  - `proposed`: Opportunity received
  - `reviewed`: Reviewed
  - `approved`: Approved for preparation
  - `ready_to_dispatch`: Ready for simulation
  - `mock_sent`: Simulation sent
  - `mock_result`: Simulation completed

### No-real-execution status

- Source: `dispatch_execution_audit.no_real_execution` and
  `device_command_audit.no_real_execution`
- Formula: all matching rows must be true
- Fallback: true safety policy with no execution record

## Flexibility Score

The score is shown only when the data sufficiency rules in
`docs/flexibility-score-methodology.md` pass.

## Community Metrics

### Active households

- Source: latest household device timestamps
- Formula: distinct households with telemetry in the last 10 minutes
- Privacy: community aggregate

### Community demand

- Source: latest power per device
- Formula: sum across authorized community
- Privacy: community aggregate

### Average household load

- Formula: community demand divided by households with current power data
- Privacy: community aggregate

### Household percentile

- Formula: percent of community households with current demand less than or
  equal to the selected household
- Suppression: unavailable when fewer than five households have data
- Privacy: selected household plus aggregate result only

### Device-type distribution

- Formula: count by broad device type
- Privacy: community aggregate

## Insight Metrics

The SLM may select only validated insight keys backed by these facts:

- highest power bucket
- highest device-type contribution
- current flexible load estimate
- previous-period energy comparison
- latest simulated flexibility participation
- anonymized community percentile

If required facts are missing, stale, or numerically inconsistent, the
insight is rejected.

## Unsupported Metrics

The dashboard does not calculate:

- money saved
- tariff cost
- carbon emissions
- carbon avoided
- physical grid export
- physical energy shifted
- real device availability

These require external tariffs, carbon-intensity data, certified metering, or
real device integrations.
