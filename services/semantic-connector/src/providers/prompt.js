"use strict";

const responseSchema = require("../../../../schemas/slm-semantic-batch-response.schema.json");

const ALLOWED_REASON_CODES = responseSchema.properties.mappings.items.properties.mapping_reason_code.enum;
const ALLOWED_CONCEPTS = responseSchema.properties.mappings.items.properties.saref_concept.enum;
const ALLOWED_PROPERTIES = responseSchema.properties.mappings.items.properties.saref_property.enum;
const ALLOWED_UNITS = responseSchema.properties.mappings.items.properties.saref_unit.enum;

const CANONICAL_EXAMPLES = Object.freeze([
  "active_power_kw|kW=>saref4ener:PowerMeasurement|saref:Power|unit:KiloW",
  "voltage_v|V=>saref4ener:VoltageMeasurement|saref:Voltage|unit:V",
  "current_a|A=>saref4ener:CurrentMeasurement|saref:Current|unit:A",
  "energy_import_kwh|kWh=>saref4ener:EnergyImportMeasurement|saref:Energy|unit:KiloW-HR",
  "energy_delivered_kwh|kWh=>saref4ener:EnergyConsumptionMeasurement|saref:Energy|unit:KiloW-HR",
  "ev_charging_power_kw|kW=>saref4ener:EVChargingDemandMeasurement|saref:Power|unit:KiloW",
  "heat_pump_power_kw|kW=>saref4ener:HeatPumpPowerMeasurement|saref:Power|unit:KiloW",
  "indoor_temperature_c|C=>saref4ener:TemperatureMeasurement|saref:Temperature|unit:DEG_C",
  "water_temperature_c|C=>saref4ener:TemperatureMeasurement|saref:Temperature|unit:DEG_C",
  "pv_generation_kw|kW=>saref4ener:PVGenerationMeasurement|saref:Power|unit:KiloW",
  "battery_soc_percent|percent=>saref4ener:BatteryStateOfChargeMeasurement|saref:StateOfCharge|unit:PERCENT",
  "operating_state|state_code=>saref4ener:Measurement|saref:Property|unit:UNITLESS"
]);

function compactReading(reading) {
  return {
    reading_id: reading.reading_id,
    device_type: reading.device_type,
    field: reading.reading_name,
    value: reading.reading_value,
    unit: reading.reading_unit || "unitless"
  };
}

function buildBatchPrompt(readings, options = {}) {
  const input = readings.map(compactReading);
  const validationHints = options.validationHints || {};
  const retryHints = readings
    .map((reading) => ({
      reading_id: reading.reading_id,
      rejected_reason_codes: validationHints[reading.reading_id] || []
    }))
    .filter((item) => item.rejected_reason_codes.length > 0);
  return [
    "Map every telemetry reading to safe energy semantics.",
    "Return one JSON object only, with exactly one mappings item for every input reading_id.",
    "Do not omit, duplicate, or invent reading IDs. Do not return markdown or extra text.",
    "Never create commands, actions, setpoints, URLs, credentials, device IDs, or household IDs.",
    "Output item keys exactly: reading_id,saref_concept,saref_property,saref_unit,confidence,mapping_reason_code.",
    `Allowed concepts: ${ALLOWED_CONCEPTS.join(",")}`,
    `Allowed properties: ${ALLOWED_PROPERTIES.join(",")}`,
    `Allowed units: ${ALLOWED_UNITS.join(",")}`,
    `Allowed reason codes: ${ALLOWED_REASON_CODES.join(",")}`,
    "Canonical relationships: kW=>saref:Power/unit:KiloW; kWh=>saref:Energy/unit:KiloW-HR; V=>saref:Voltage/unit:V; A=>saref:Current/unit:A; Hz=>saref:Frequency/unit:HZ; C=>saref:Temperature/unit:DEG_C; percent=>unit:PERCENT; state_code=>saref:Property/unit:UNITLESS.",
    `Canonical field examples (field|input unit=>concept|property|semantic unit): ${CANONICAL_EXAMPLES.join(";")}`,
    "Use field and device context to choose the concept: EV charging power=>EVChargingDemandMeasurement; heat-pump power=>HeatPumpPowerMeasurement; heat-pump flow temperature=>HeatPumpTemperatureMeasurement; other temperatures=>TemperatureMeasurement; imported energy=>EnergyImportMeasurement; delivered, exported, throughput, or consumed energy=>EnergyConsumptionMeasurement; PV power=>PVGenerationMeasurement; battery power=>PowerMeasurement; battery percent=>BatteryStateOfChargeMeasurement; state codes=>Measurement/saref:Property/unit:UNITLESS.",
    "confidence must be a JSON number from 0 to 1. Use 0.95 for an exact canonical field and unit match. Use uncertain_mapping and a value below 0.70 only when uncertain.",
    ...(retryHints.length ? [
      "The previous SLM proposal was rejected. Correct it using the canonical rules above.",
      `Validator reason codes by reading: ${JSON.stringify(retryHints)}`
    ] : []),
    `Input readings: ${JSON.stringify(input)}`
  ].join("\n");
}

function buildResponseSchema(readings) {
  const schema = JSON.parse(JSON.stringify(responseSchema));
  const readingIds = readings.map((reading) => reading.reading_id);
  schema.properties.mappings.minItems = readingIds.length;
  schema.properties.mappings.maxItems = readingIds.length;
  schema.properties.mappings.items.properties.reading_id.enum = readingIds;
  return schema;
}

function estimateBatchTokens(readings) {
  const promptCharacters = buildBatchPrompt(readings).length;
  const estimatedOutputCharacters = readings.length * 230 + 20;
  return Math.ceil((promptCharacters + estimatedOutputCharacters) / 4);
}

module.exports = {
  buildBatchPrompt,
  buildResponseSchema,
  compactReading,
  estimateBatchTokens,
  responseSchema
};
