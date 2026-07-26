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

function categoriesForProfile(profile, random) {
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

function buildDevice({
  category,
  occurrence,
  householdId,
  communityId,
  areaId,
  profile,
  random
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
  const households = [];
  const devices = [];

  for (let index = 0; index < householdCount; index += 1) {
    const householdId = `${prefix}-${String(index + 1).padStart(3, "0")}`;
    const profile = profileForIndex(index, config.profileMix);
    const areaId = `${config.areaPrefix || "dublin-north"}-${String((index % 4) + 1).padStart(2, "0")}`;
    const categories = categoriesForProfile(profile, profileRandom);
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
        random
      });
    });

    households.push({
      household_id: householdId,
      community_id: communityId,
      area_id: areaId,
      profile,
      device_count: householdDevices.length
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
  PROFILE_CATEGORIES,
  PROFILE_LIMITS,
  buildFleet,
  categoriesForProfile,
  seededRandom
};

