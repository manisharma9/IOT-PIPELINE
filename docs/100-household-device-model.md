# 100-Household Device Model

## Household Fields

Each household contains:

- globally unique household ID;
- profile: `apartment`, `standard_home`, or `prosumer_home`;
- community and area;
- configurable time zone;
- reproducible random seed;
- occupancy pattern;
- base-load profile;
- independent reporting interval and offset;
- `simulated=true`.

## Asset Fields

Each asset contains:

- globally unique device ID;
- household and community identity;
- category and display name;
- simulated manufacturer/provider;
- measurement capabilities;
- online state and last-seen timestamp;
- operating state;
- primary measurement and cumulative energy where supported;
- flexibility capability and maximum flexible power;
- deterministic reporting offset;
- `simulated=true`;
- `no_real_execution=true`.

## Profile Inventories

### Apartment

One smart meter, two smart plugs, one refrigerator, one washing machine,
one lighting circuit, one water heater, and one thermostat/HVAC.

### Standard Home

One smart meter, two smart plugs, one refrigerator, one washing machine,
one dishwasher, one lighting circuit, one water heater, one heat pump, and
one EV charger.

### Prosumer Home

The standard-home inventory plus one solar inverter, one home battery, and
one additional smart plug.

## State Generation

Devices use independent seeded pseudo-random sequences. State changes are
reproducible while remaining distinct across assets. Power, temperature,
state of charge, generation, operating state, and cumulative energy evolve
according to category-specific simulation logic.

## Registry and Customer Read Model

Telemetry metadata is validated at ingestion, carried through normalized
events, and transactionally upserted into `simulated_device_registry` by the
engine. The customer dashboard reads bounded aggregates and paginated
latest-state data. It does not invent device inventory in the browser.

## Safety Boundary

The fleet represents virtual assets only. Approved dispatch reaches the
existing mock adapter and simulated Shelly, Enode/Easee, and Heat Pump
translation path. No physical device command is enabled.

