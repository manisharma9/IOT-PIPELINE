"use strict";

const responseSchema = require("../../../../schemas/slm-semantic-batch-response.schema.json");

const ALLOWED_REASON_CODES = responseSchema.properties.mappings.items.properties.mapping_reason_code.enum;
const ALLOWED_CONCEPTS = responseSchema.properties.mappings.items.properties.saref_concept.enum;
const ALLOWED_PROPERTIES = responseSchema.properties.mappings.items.properties.saref_property.enum;
const ALLOWED_UNITS = responseSchema.properties.mappings.items.properties.saref_unit.enum;

function compactReading(reading) {
  return {
    reading_id: reading.reading_id,
    device_type: reading.device_type,
    field: reading.reading_name,
    value: reading.reading_value,
    unit: reading.reading_unit || "unitless"
  };
}

function buildBatchPrompt(readings) {
  const input = readings.map(compactReading);
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
    "Use field and device context to choose the concept: EV charging power=>EVChargingDemandMeasurement; heat-pump power=>HeatPumpPowerMeasurement; heat-pump temperatures=>HeatPumpTemperatureMeasurement; imported energy=>EnergyImportMeasurement; delivered or consumed energy=>EnergyConsumptionMeasurement.",
    "confidence must be a JSON number from 0 to 1. Use uncertain_mapping and low confidence when uncertain.",
    `Input readings: ${JSON.stringify(input)}`
  ].join("\n");
}

function estimateBatchTokens(readings) {
  const promptCharacters = buildBatchPrompt(readings).length;
  const estimatedOutputCharacters = readings.length * 230 + 20;
  return Math.ceil((promptCharacters + estimatedOutputCharacters) / 4);
}

module.exports = {
  buildBatchPrompt,
  compactReading,
  estimateBatchTokens,
  responseSchema
};
