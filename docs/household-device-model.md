# Household Device Model

## Purpose

The household device model gives the AD-FLEX demonstration a realistic,
repeatable inventory without creating one process, thread, or Docker
container per device. It extends the existing Shelly Plug, Enode/Easee
charger, and heat-pump simulators with common household energy categories.

All devices are simulated. Every inventory record and telemetry envelope
enforces:

```text
simulated = true
no_real_execution = true
```

## Common Contract

Every virtual device extends the shared `BaseDevice` contract and provides:

- `tick(timestamp)`: advances independent device state;
- `getTelemetry(timestamp)`: advances state and returns an ingestion-compatible
  telemetry envelope;
- `getStatus()`: returns current state for registration and diagnostics.

Each device has:

- a globally unique device ID;
- household, community, and area scope;
- a device category and customer-facing display name;
- online and last-seen state;
- an operating state;
- current power and cumulative energy;
- declared flexibility capability and maximum flexible power;
- a reproducible pseudo-random state stream.

## Supported Categories

| Category | Typical state | Power range | Flexibility |
| --- | --- | ---: | --- |
| `smart_meter` | monitoring | 0.8-7.5 kW | no |
| `smart_plug` | on/off | up to 1.5 kW controllable | yes |
| `refrigerator` | cooling/idle | 0.06-0.18 kW | no |
| `washing_machine` | washing/rinsing/spinning/idle | 0-1.9 kW | yes |
| `clothes_dryer` | drying/cool-down/idle | 0-2.6 kW | yes |
| `dishwasher` | washing/drying/idle | 0-1.7 kW | yes |
| `lighting_circuit` | on/dimmed/off | 0.03-0.42 kW | yes |
| `ev_charger` | charging/paused/idle | existing Easee model | yes |
| `heat_pump` | heating/idle | existing heat-pump model | yes |
| `thermostat_hvac` | heating/cooling/idle | 0.25-2.2 kW | yes |
| `water_heater` | heating/holding/idle | 0-3.0 kW | yes |
| `solar_inverter` | generating/exporting/standby | 0-5.5 kW generation | yes |
| `home_battery` | charging/discharging/idle | -3.5 to 3.5 kW | yes |

The specialized Shelly, Enode/Easee, and heat-pump classes remain in use for
their public simulator APIs. The generic `HouseholdDevice` class handles the
additional categories.

## Telemetry Shape

The fleet emits both the modern simulator shape and the existing pipeline
aliases:

```json
{
  "deviceId": "demo-household-003-washing-machine-01",
  "deviceType": "washing_machine",
  "householdId": "demo-household-003",
  "timestamp": "2026-07-24T15:00:00.000Z",
  "data": {
    "active_power_kw": {
      "value": 1.21,
      "unit": "kW"
    },
    "energy_import_kwh": {
      "value": 182.34,
      "unit": "kWh"
    },
    "operating_state_code": {
      "value": 3,
      "unit": "state_code"
    }
  },
  "simulated": true,
  "no_real_execution": true
}
```

The same envelope includes snake-case identifiers and `readings` for
backward compatibility. It therefore follows the existing route:

```text
household-fleet-simulator
-> security-gateway
-> ingestion-api
-> raw.telemetry
-> engine
-> normalized.telemetry
```

## Household Profiles

| Profile | Allowed devices | Typical composition |
| --- | ---: | --- |
| `apartment` | 6-9 | meter, plug, refrigerator, lighting, HVAC, water heating, optional laundry |
| `standard_home` | 10-14 | apartment equipment plus EV charging, heat pump, dishwasher, and dryer |
| `prosumer_home` | 14-20 | standard home plus solar generation, battery storage, and additional flexible loads |

Required and optional categories differ by profile. A deterministic seed
controls profile size, optional devices, state changes, and staggered
emission timing, so a test can be repeated without making all households
identical.

## Default Inventory

The default seed creates:

| Measure | Value |
| --- | ---: |
| Households | 20 |
| Devices | 241 |
| Average devices per household | 12.05 |
| Apartment households | 6 |
| Standard homes | 8 |
| Prosumer homes | 6 |

All 13 supported categories are represented. The configuration is in
`config/household-fleet.example.json` and can be overridden through
environment variables.

## Persistence And Customer Use

`simulated_device_registry` stores non-telemetry metadata such as display
name, profile, provider, and flexibility capability. Actual power, energy,
temperature, and state values continue to come from normalized telemetry.

Customer dashboard queries join the registry to bounded latest-state and
time-bucketed views. Device lists use server-side filtering and pagination;
the browser never requests the complete community inventory at once.

## Scale Boundary

One fleet process holds current state, next emission time, and at most one
pending telemetry envelope per virtual device. A single scheduler and bounded
in-flight limit replace per-device timers and processes.

Thousands of virtual households can be represented by increasing the
configuration or by assigning household ranges to a small number of fleet
workers. That is an architecture capability, not a claim that the complete
local Phi-3 semantic path has been validated at that scale.

## Safety And Limitations

- No physical device endpoint is contacted.
- No real device credential is stored.
- Fleet telemetry can be retried, but is never converted into a real command.
- A failed delivery retains one bounded pending envelope and records the
  failure; it is not silently dropped.
- Energy values are realistic simulation values, not billing-grade
  measurements.
- The single local Phi-3 Mini worker is slower than the default fleet's
  normalized-reading arrival rate. Semantic backlog and safely-unmapped
  outcomes must be monitored during long demonstrations.
