# Household Fleet Simulator

## Current-State Audit

The repository already has a sound simulator contract in
`services/common/simulators/base-device.js`. A simulated device owns its
state and exposes `tick()` and `getTelemetry()`. The Shelly Plug,
Enode/Easee charger, and heat-pump implementations extend that contract and
must remain the authoritative implementations for those public simulator
APIs.

The earlier multi-household validation runner creates three devices per
household inside one Node.js process. It proves that virtual devices do not
need one container, process, or thread each, but it is a finite validation
runner rather than a continuously running household fleet.

The customer read model currently derives device state from
`normalized_telemetry`. That supports current power, cumulative energy,
temperature, and recent activity, but it cannot reliably infer a friendly
display name, household profile, declared flexibility capability, or maximum
flexible power. Those attributes therefore require a small persisted device
registry. Telemetry remains the source of measured simulated values.

## Selected Architecture

`household-fleet-simulator` is one bounded Node.js service. It:

1. Builds a reproducible inventory from household profiles and a random seed.
2. Keeps only current state and the next emission time for each virtual
   device in memory.
3. Uses one scheduler loop rather than one timer, process, thread, or
   container per device.
4. Spreads initial and recurring telemetry across the configured reporting
   interval to avoid an artificial startup burst. The default three-minute
   interval keeps the 241-device demo below the gateway's 120-request/minute
   per-client limit.
5. Sends every telemetry envelope through `security-gateway`.
6. Registers non-telemetry metadata in TimescaleDB for the customer read
   model.
7. Exposes only a local health and inventory summary endpoint.

Rate-limited or temporarily unavailable gateway requests retain one bounded
pending telemetry envelope per device. The scheduler honors `Retry-After`
where available and retries that same envelope; it does not accumulate an
unbounded history or silently drop the update.

The design scales by increasing the number of virtual records held by a
bounded number of simulator processes. Horizontal sharding can be added later
by assigning household ranges to a small number of fleet workers.

## Household Profiles

| Profile | Device count | Purpose |
| --- | ---: | --- |
| `apartment` | 6-9 | Compact household without mandatory generation or storage |
| `standard_home` | 10-14 | Typical electrified home with flexible appliances |
| `prosumer_home` | 14-20 | Home with EV charging, solar generation, and battery storage |

The default fleet contains 20 households with a deterministic mix of all
three profiles. Profiles define required and optional categories, so
households are not identical.

The default seed produced this measured inventory:

| Profile | Households | Devices | Average |
| --- | ---: | ---: | ---: |
| `apartment` | 6 | 38 | 6.33 |
| `standard_home` | 8 | 98 | 12.25 |
| `prosumer_home` | 6 | 105 | 17.50 |
| **Total** | **20** | **241** | **12.05** |

## Device Contract

Every inventory record carries:

- unique `device_id`
- `household_id`, `community_id`, and `area_id`
- category and customer-facing display name
- online state and last-seen timestamp
- operating state
- current power and cumulative energy
- flexibility capability and maximum flexible power
- `simulated=true`
- `no_real_execution=true`

Telemetry uses the existing compatibility envelope:

```json
{
  "deviceId": "fleet-hh-001-smart-meter-01",
  "deviceType": "smart_meter",
  "timestamp": "2026-07-24T12:00:00.000Z",
  "data": {
    "active_power_kw": { "value": 2.14, "unit": "kW" },
    "energy_import_kwh": { "value": 4812.75, "unit": "kWh" }
  },
  "householdId": "fleet-household-001",
  "simulated": true,
  "no_real_execution": true
}
```

Legacy snake-case identifiers and `readings` remain present for ingestion
compatibility.

## Configuration

The example model is in `config/household-fleet.example.json`.

| Variable | Default | Meaning |
| --- | ---: | --- |
| `FLEET_HOUSEHOLD_COUNT` | 20 | Number of virtual households |
| `FLEET_RANDOM_SEED` | 20260724 | Reproducible inventory and state seed |
| `FLEET_REPORTING_INTERVAL_MS` | 180000 | Per-device reporting interval before jitter |
| `FLEET_SCHEDULER_TICK_MS` | 250 | Single scheduler cadence |
| `FLEET_MAX_IN_FLIGHT` | 8 | Maximum concurrent gateway requests |
| `FLEET_AUTOSTART` | true | Start telemetry after service startup |
| `FLEET_COMMUNITY_ID` | community-dublin-north | Community scope |
| `FLEET_HOUSEHOLD_PREFIX` | demo-household | Generated household prefix |

The reporting interval is jittered independently by approximately 10
percent. Initial emissions are distributed over one interval rather than
sent as a startup burst.

## Runtime Endpoints

The fleet service exposes development-only loopback endpoints:

- `GET http://127.0.0.1:3012/health`
- `GET http://127.0.0.1:3012/fleet/summary`

They return aggregate inventory and delivery counters only. They are not
available through the public customer dashboard.

## Measured Local Validation

On 24 July 2026, the running default fleet reported:

| Measure | Result |
| --- | ---: |
| Registered households | 20 |
| Registered devices | 241 |
| Accepted fleet telemetry messages | 3,436 |
| Retried messages | 6 |
| Dropped messages | 0 |
| Raw fleet rows stored | 3,781 |
| Normalized fleet readings stored | 14,207 |
| Device categories with normalized telemetry | 13 of 13 |
| Devices with normalized telemetry | 241 of 241 |

The accepted counter includes successful retry completion. Raw-row totals
also include earlier messages from the same deterministic fleet IDs.

The fleet and normalization paths kept up. The single local Phi-3 Mini
semantic worker did not keep up with the resulting reading rate and accepted
very few strict mappings; most completed attempts were recorded as safely
unmapped. This is a semantic-inference capacity and structured-output
quality limitation, not a fleet delivery failure.

## Safety Boundary

The service generates simulated telemetry only. It does not hold device
credentials, contact physical devices, or enable command execution. Existing
Shelly, Enode/Easee, and heat-pump command simulators remain unchanged and
continue to enforce simulated responses.
