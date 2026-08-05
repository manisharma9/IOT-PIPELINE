"use strict";

const {
  createEnodeEaseeDevice,
  createHeatPumpDevice,
  createHouseholdDevice,
  createShellyPlugDevice
} = require("../../common/simulators");

const PROFILE_LIMITS = Object.freeze({
  apartment: [6, 9],
  standard_home: [10, 14],
  prosumer_home: [14, 20]
});

const PROFILE_CATEGORIES = Object.freeze({
  apartment: {
    required: [
      "smart_meter",
      "smart_plug",
      "refrigerator",
      "lighting_circuit",
      "thermostat_hvac",
      "water_heater"
    ],
    optional: ["washing_machine", "dishwasher", "heat_pump"]
  },
  standard_home: {
    required: [
      "smart_meter",
      "smart_plug",
      "refrigerator",
      "washing_machine",
      "dishwasher",
      "lighting_circuit",
      "ev_charger",
      "heat_pump",
      "thermostat_hvac",
      "water_heater"
    ],
    optional: ["clothes_dryer", "smart_plug", "lighting_circuit", "dishwasher"]
  },
  prosumer_home: {
    required: [
      "smart_meter",
      "smart_plug",
      "refrigerator",
      "washing_machine",
      "clothes_dryer",
      "dishwasher",
      "lighting_circuit",
      "ev_charger",
      "heat_pump",
      "thermostat_hvac",
      "water_heater",
      "solar_inverter",
      "home_battery",
      "smart_plug"
    ],
    optional: [
      "smart_plug",
      "lighting_circuit",
      "water_heater",
      "ev_charger",
      "dishwasher",
      "thermostat_hvac"
    ]
  }
});

const EXACT_PROFILE_INVENTORIES = Object.freeze({
  apartment: Object.freeze([
    "smart_meter",
    "smart_plug",
    "smart_plug",
    "refrigerator",
    "washing_machine",
    "lighting_circuit",
    "water_heater",
    "thermostat_hvac"
  ]),
  standard_home: Object.freeze([
    "smart_meter",
    "smart_plug",
    "smart_plug",
    "refrigerator",
    "washing_machine",
    "dishwasher",
    "lighting_circuit",
    "water_heater",
    "heat_pump",
    "ev_charger"
  ]),
  prosumer_home: Object.freeze([
    "smart_meter",
    "smart_plug",
    "smart_plug",
    "refrigerator",
    "washing_machine",
    "dishwasher",
    "lighting_circuit",
    "water_heater",
    "heat_pump",
    "ev_charger",
    "solar_inverter",
    "home_battery",
    "smart_plug"
  ])
});

const OCCUPANCY_PATTERNS = Object.freeze({
  apartment: Object.freeze(["weekday_commuter", "hybrid_worker", "evening_occupied"]),
  standard_home: Object.freeze(["family_weekday", "hybrid_family", "daytime_occupied"]),
  prosumer_home: Object.freeze(["prosumer_balanced", "solar_aligned", "storage_optimized"])
});

const BASE_LOAD_PROFILES = Object.freeze({
  apartment: "compact_urban",
  standard_home: "family_balanced",
  prosumer_home: "generation_and_storage"
});

function seededRandom(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function integerBetween(random, minimum, maximum) {
  return Math.floor(minimum + random() * (maximum - minimum + 1));
}

function profileForIndex(index, configuredMix = {}) {
  const sequence = [];
  for (const profile of Object.keys(PROFILE_LIMITS)) {
    const count = Math.max(0, Number(configuredMix[profile] || 0));
    for (let item = 0; item < count; item += 1) sequence.push(profile);
  }
  if (sequence.length) return sequence[index % sequence.length];
  return ["apartment", "standard_home", "prosumer_home"][index % 3];
}

function categoriesForProfile(profile, random, exact = false) {
  if (exact) {
    const exactInventory = EXACT_PROFILE_INVENTORIES[profile];
    if (!exactInventory) throw new Error(`Unknown household profile: ${profile}`);
    return [...exactInventory];
  }
  const definition = PROFILE_CATEGORIES[profile];
  if (!definition) throw new Error(`Unknown household profile: ${profile}`);
  const [minimum, maximum] = PROFILE_LIMITS[profile];
  const target = integerBetween(random, minimum, maximum);
  const categories = [...definition.required];
  let optionalIndex = 0;
  while (categories.length < target) {
    categories.push(definition.optional[optionalIndex % definition.optional.length]);
    optionalIndex += 1;
  }
  return categories.slice(0, target);
}

function slug(value) {
  return String(value).replaceAll("_", "-");
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableReportingOffset(deviceId, reportingWindowMs) {
  const window = Math.max(1, Number(reportingWindowMs) || 1);
  return stableHash(deviceId) % window;
}

function manufacturerFor(category, provider) {
  if (category === "smart_plug") return "Shelly (simulated)";
  if (category === "ev_charger") return "Enode / Easee (simulated)";
  if (category === "heat_pump") return "AD-FLEX Heat Pump Simulator";
  return `${String(provider || "AD-FLEX").replaceAll("_", " ")} (simulated)`;
}

function initialInventoryState(device, referenceTimestamp) {
  const status = device.getStatus(referenceTimestamp);
  const readings = device.getData();
  const [primaryField, primaryReading] = Object.entries(readings)[0] || [null, null];
  const energyEntry = Object.entries(readings).find(([field]) =>
    /(energy|throughput).*kwh/i.test(field)
  );

  return {
    manufacturer: manufacturerFor(device.deviceType, device.provider),
    measurement_capabilities: Object.keys(readings),
    online: status.online !== false,
    current_operating_state:
      status.operating_state ||
      status.relay_state ||
      status.charging_state ||
      "available",
    last_seen_timestamp: referenceTimestamp,
    current_primary_measurement: primaryField ? {
      field: primaryField,
      value: Number(primaryReading?.value ?? primaryReading),
      unit: primaryReading?.unit || null
    } : null,
    cumulative_energy_kwh: energyEntry
      ? Number(energyEntry[1]?.value ?? energyEntry[1])
      : null
  };
}

function buildDevice({
  category,
  occurrence,
  householdId,
  communityId,
  areaId,
  profile,
  random,
  referenceTimestamp,
  reportingWindowMs
}) {
  const deviceId = `${householdId}-${slug(category)}-${String(occurrence).padStart(2, "0")}`;
  const common = {
    deviceId,
    householdId,
    communityId,
    areaId,
    random
  };

  let device;
  if (category === "smart_plug") {
    device = createShellyPlugDevice(common);
  } else if (category === "ev_charger") {
    device = createEnodeEaseeDevice(common);
  } else if (category === "heat_pump") {
    device = createHeatPumpDevice(common);
  } else {
    device = createHouseholdDevice({ ...common, deviceType: category });
  }

  const status = device.getStatus();
  return {
    device,
    inventory: {
      device_id: deviceId,
      household_id: householdId,
      community_id: communityId,
      area_id: areaId,
      household_profile: profile,
      device_category: category,
      display_name:
        status.display_name ||
        (category === "smart_plug" ? `Shelly smart plug ${occurrence}` :
          category === "ev_charger" ? `Easee EV charger ${occurrence}` :
            category === "heat_pump" ? `Heat pump ${occurrence}` :
              `${category.replaceAll("_", " ")} ${occurrence}`),
      provider: device.provider,
      flexibility_capable:
        Boolean(status.flexibility_capable) ||
        ["smart_plug", "ev_charger", "heat_pump"].includes(category),
      maximum_flexible_power_kw:
        Number(status.maximum_flexible_power_kw || device.controllableLoadKw || 0),
      ...initialInventoryState(device, referenceTimestamp),
      reporting_offset_ms: stableReportingOffset(deviceId, reportingWindowMs),
      simulated: true,
      no_real_execution: true
    }
  };
}

function buildFleet(config = {}) {
  const householdCount = Math.max(1, Number(config.householdCount || 20));
  const seed = Number(config.seed || 20260724);
  const communityId = config.communityId || "community-dublin-north";
  const prefix = config.householdPrefix || "demo-household";
  const profileRandom = seededRandom(seed);
  const exactProfileInventories = Boolean(config.exactProfileInventories);
  const reportingWindowMs = Math.max(
    1,
    Number(config.reportingWindowMs || config.reportingIntervalMs || 600000)
  );
  const referenceTimestamp =
    config.referenceTimestamp || "2026-01-01T00:00:00.000Z";
  const timeZone = config.timeZone || "Europe/Dublin";
  const households = [];
  const devices = [];
  const profileOrdinals = new Map();

  if (exactProfileInventories) {
    const configuredHouseholds = Object.values(config.profileMix || {})
      .reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
    if (configuredHouseholds !== householdCount) {
      throw new Error(
        `Exact profile mix defines ${configuredHouseholds} households; expected ${householdCount}.`
      );
    }
  }

  for (let index = 0; index < householdCount; index += 1) {
    const profile = profileForIndex(index, config.profileMix);
    const profileOrdinal = (profileOrdinals.get(profile) || 0) + 1;
    profileOrdinals.set(profile, profileOrdinal);
    const householdId = exactProfileInventories
      ? `${prefix}-${slug(profile)}-${String(profileOrdinal).padStart(3, "0")}`
      : `${prefix}-${String(index + 1).padStart(3, "0")}`;
    const areaId = `${config.areaPrefix || "dublin-north"}-${String((index % 4) + 1).padStart(2, "0")}`;
    const householdSeed = seed + (index + 1) * 1009;
    const categories = categoriesForProfile(profile, profileRandom, exactProfileInventories);
    const occurrences = new Map();
    const householdDevices = categories.map((category, categoryIndex) => {
      const occurrence = (occurrences.get(category) || 0) + 1;
      occurrences.set(category, occurrence);
      const random = seededRandom(seed + (index + 1) * 1009 + (categoryIndex + 1) * 9176);
      return buildDevice({
        category,
        occurrence,
        householdId,
        communityId,
        areaId,
        profile,
        random,
        referenceTimestamp,
        reportingWindowMs
      });
    });

    const occupancyOptions = OCCUPANCY_PATTERNS[profile];
    households.push({
      household_id: householdId,
      community_id: communityId,
      area_id: areaId,
      profile,
      device_count: householdDevices.length,
      time_zone: timeZone,
      random_seed: householdSeed,
      occupancy_pattern: occupancyOptions[index % occupancyOptions.length],
      base_load_profile: BASE_LOAD_PROFILES[profile],
      reporting_schedule: {
        window_ms: reportingWindowMs,
        strategy: "stable_device_hash"
      },
      simulated: true
    });
    devices.push(...householdDevices);
  }

  return {
    seed,
    households,
    devices,
    summary: {
      household_count: households.length,
      device_count: devices.length,
      average_devices_per_household:
        Math.round((devices.length / households.length) * 100) / 100,
      profiles: households.reduce((result, household) => ({
        ...result,
        [household.profile]: (result[household.profile] || 0) + 1
      }), {}),
      categories: devices.reduce((result, entry) => ({
        ...result,
        [entry.inventory.device_category]:
          (result[entry.inventory.device_category] || 0) + 1
      }), {})
    }
  };
}

module.exports = {
  BASE_LOAD_PROFILES,
  EXACT_PROFILE_INVENTORIES,
  OCCUPANCY_PATTERNS,
  PROFILE_CATEGORIES,
  PROFILE_LIMITS,
  buildFleet,
  categoriesForProfile,
  seededRandom,
  stableHash,
  stableReportingOffset
};
