"use strict";

const DETERMINISTIC_MAPPINGS = Object.freeze({
  active_power_kw: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    saref4ener_concept: "saref4ener:PowerMeasurement",
    ngsi_type: "Property",
    ngsi_property: "activePower",
    explanation:
      "Active power in kW is mapped as an instantaneous electrical power measurement for energy flexibility decisions."
  },
  voltage_v: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Voltage",
    saref_unit: "unit:V",
    saref4ener_concept: "saref4ener:VoltageMeasurement",
    ngsi_type: "Property",
    ngsi_property: "voltage",
    explanation:
      "Voltage in volts is mapped as an electrical voltage measurement for the connected device or meter."
  },
  current_a: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Current",
    saref_unit: "unit:A",
    saref4ener_concept: "saref4ener:CurrentMeasurement",
    ngsi_type: "Property",
    ngsi_property: "current",
    explanation:
      "Current in amperes is mapped as an electrical current measurement for the connected device or meter."
  },
  energy_kwh: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Energy",
    saref_unit: "unit:KiloW-HR",
    saref4ener_concept: "saref4ener:EnergyConsumptionMeasurement",
    ngsi_type: "Property",
    ngsi_property: "energyConsumed",
    explanation:
      "Energy in kWh is mapped as cumulative energy consumption for household or community flexibility analysis."
  },
  energy_import_kwh: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Energy",
    saref_unit: "unit:KiloW-HR",
    saref4ener_concept: "saref4ener:EnergyImportMeasurement",
    ngsi_type: "Property",
    ngsi_property: "energyImported",
    explanation:
      "Imported energy in kWh is mapped as energy drawn from the grid by the household or community."
  },
  frequency_hz: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Frequency",
    saref_unit: "unit:HZ",
    saref4ener_concept: "saref4ener:GridFrequencyMeasurement",
    ngsi_type: "Property",
    ngsi_property: "frequency",
    explanation:
      "Frequency in hertz is mapped as a grid frequency measurement useful for power quality monitoring."
  },
  power_factor: {
    saref_type: "saref:Measurement",
    saref_property: "saref:PowerFactor",
    saref_unit: "unit:UNITLESS",
    saref4ener_concept: "saref4ener:PowerFactorMeasurement",
    ngsi_type: "Property",
    ngsi_property: "powerFactor",
    explanation:
      "Power factor is mapped as a unitless electrical efficiency measurement for the connected device or meter."
  },
  pv_generation_kw: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    saref4ener_concept: "saref4ener:PVGenerationMeasurement",
    ngsi_type: "Property",
    ngsi_property: "pvGenerationPower",
    explanation:
      "PV generation in kW is mapped as local photovoltaic production available to support flexibility decisions."
  },
  ev_charging_power_kw: {
    saref_type: "saref:Measurement",
    saref_property: "saref:Power",
    saref_unit: "unit:KiloW",
    saref4ener_concept: "saref4ener:EVChargingDemandMeasurement",
    ngsi_type: "Property",
    ngsi_property: "evChargingPower",
    explanation:
      "EV charging power in kW is mapped as electric vehicle charging demand that may be shifted or curtailed later."
  },
  battery_soc_percent: {
    saref_type: "saref:Measurement",
    saref_property: "saref:StateOfCharge",
    saref_unit: "unit:PERCENT",
    saref4ener_concept: "saref4ener:BatteryStateOfChargeMeasurement",
    ngsi_type: "Property",
    ngsi_property: "batteryStateOfCharge",
    explanation:
      "Battery state of charge is mapped as a percentage measurement for storage flexibility availability."
  }
});

function normalizeReadingName(readingName) {
  return String(readingName || "")
    .trim()
    .toLowerCase();
}

function buildUnmappedResult(readingName) {
  const normalizedName = normalizeReadingName(readingName) || "unknown_reading";

  return {
    saref_type: "saref:Measurement",
    saref_property: "unmapped",
    saref_unit: null,
    saref4ener_concept: "unmapped",
    ngsi_type: "Property",
    ngsi_property: normalizedName,
    mapping_source: "unmapped",
    mapping_confidence: "low",
    explanation: `No accepted SLM or deterministic SAREF4ENER mapping exists for reading "${normalizedName}". The event is stored and published as unmapped.`
  };
}

function getSaref4enerMapping(readingName) {
  const normalizedName = normalizeReadingName(readingName);
  const mapping = DETERMINISTIC_MAPPINGS[normalizedName];

  if (!mapping) {
    return buildUnmappedResult(normalizedName);
  }

  return {
    ...mapping,
    mapping_source: "deterministic",
    mapping_confidence: "high"
  };
}

module.exports = {
  DETERMINISTIC_MAPPINGS,
  buildUnmappedResult,
  getSaref4enerMapping,
  normalizeReadingName
};
