# 1,000-Asset Local Workload Definition

## Purpose

This workload validates the AD-FLEX logical business flow on one Windows
laptop. It is a controlled functional and locally sustained test, not a
production capacity claim.

## Contractual Population

| Profile | Households | Assets per household | Assets |
|---|---:|---:|---:|
| Apartment | 30 | 8 | 240 |
| Standard home | 50 | 10 | 500 |
| Prosumer home | 20 | 13 | 260 |
| **Total** | **100** |  | **1,000** |

The generator uses random seed `1000100`, time zone `Europe/Dublin`, and
the stable household prefix `scale1000`. A profile-qualified ordinal makes
each household ID stable across the 100, 250, 500, and 1,000-asset stages.

## Device Totals

| Category | Count |
|---|---:|
| Smart meter | 100 |
| Smart plug | 220 |
| Refrigerator | 100 |
| Washing machine | 100 |
| Lighting circuit | 100 |
| Water heater | 100 |
| Thermostat/HVAC | 30 |
| Dishwasher | 70 |
| Heat pump | 70 |
| EV charger | 70 |
| Solar inverter | 20 |
| Home battery | 20 |
| **Total** | **1,000** |

## Message Shape

Each update contains identity, operating-state metadata, and one primary
semantic measurement. Metadata is preserved in `device_context`; it does
not create unnecessary SLM readings.

Every message has a unique message ID and correlation ID. Every reading
has a unique reading ID. Device and household identity are stable.

The primary field rotates on later cycles. This allows coverage of power,
energy, voltage, current, temperature, state of charge, generation,
operating state, charging state, and availability without bypassing the
mandatory SLM.

## Scheduling

The default population test sends one update per asset over 600 seconds.
The offset is deterministic:

```text
report_offset_ms = stable_hash(device_id) modulo reporting_window_ms
```

The generator uses bounded concurrency and a single scheduling loop. It
does not create one container, process, thread, or timer per device.

Controlled burst profiles are available for 50, 100, and 200 assets.
The selected burst cohort is scheduled at the start of the cycle and
released as quickly as the configured bounded gateway concurrency permits.
Remaining assets return to the normal deterministic schedule and token rate.

## Staged Populations

| Stage | Apartment | Standard | Prosumer | Households | Assets |
|---|---:|---:|---:|---:|---:|
| 100 | 3 | 5 | 2 | 10 | 100 |
| 250 | 6 | 15 | 4 | 25 | 250 |
| 500 | 12 | 30 | 8 | 50 | 500 |
| 1,000 | 30 | 50 | 20 | 100 | 1,000 |

## Test Modes

- **Population functional:** one primary reading per asset, staggered, then
  wait for all durable terminal outcomes and zero Kafka lag.
- **Semantic coverage:** at least 100 representative assets across every
  category, using complete multi-field payloads.
- **Sustained local:** 1,000 assets at a 15-minute interval initially.
  Classification is based on measured completion throughput and backlog,
  not HTTP acceptance.

## Mandatory SLM Rule

Every normalized reading must reach local Phi-3 Mini through Ollama and
must persist `slm_called=true`. Deterministic SAREF4ENER logic may validate,
reject, request an SLM retry, or mark a reading safely unmapped. It does not
create a replacement semantic mapping.

## Source Configuration

The machine-readable definition is
[`config/scale-1000-assets.json`](../config/scale-1000-assets.json).
