"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createInferenceProvider } = require("../services/semantic-connector/src/providers");
const { mapReadingBatch } = require("../services/semantic-connector/src/batch-mapper");

function args(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    result[argv[index].replace(/^--/, "")] = argv[index + 1];
  }
  return result;
}

const templates = [
  ["active_power_kw", 1.7, "kW", "shelly_plug"],
  ["voltage_v", 231.2, "V", "shelly_plug"],
  ["current_a", 7.3, "A", "shelly_plug"],
  ["energy_import_kwh", 212.5, "kWh", "shelly_plug"],
  ["ev_charging_power_kw", 6.8, "kW", "ev_charger"],
  ["energy_delivered_kwh", 18.4, "kWh", "ev_charger"],
  ["heat_pump_power_kw", 2.1, "kW", "heat_pump"],
  ["indoor_temperature_c", 20.4, "C", "heat_pump"]
];

function buildReadings(batchSize, iteration) {
  return Array.from({ length: batchSize }, (_unused, index) => {
    const [field, value, unit, deviceType] = templates[index % templates.length];
    return {
      reading_id: `benchmark-${iteration}-${index}-${Date.now()}`,
      event_time: new Date().toISOString(),
      household_id: `benchmark-household-${Math.floor(index / 3) + 1}`,
      community_id: "community-dublin-north",
      device_id: `benchmark-device-${index + 1}`,
      device_type: deviceType,
      reading_name: field,
      reading_value: value + iteration * 0.01,
      reading_unit: unit,
      correlation_id: `benchmark-${iteration}`
    };
  });
}

async function main() {
  const options = args();
  const batchSize = Math.max(1, Number(options["batch-size"]) || 4);
  const iterations = Math.max(1, Number(options.iterations) || 1);
  const timeoutMs = Math.max(1000, Number(options["timeout-ms"]) || 60000);
  const providerName = options.provider || process.env.SLM_PROVIDER || "ollama";
  const provider = createInferenceProvider({
    provider: providerName,
    endpoint: options.endpoint || (providerName === "vllm" ? "http://localhost:8000" : "http://localhost:11434"),
    model: options.model || (providerName === "vllm" ? "microsoft/Phi-3-mini-4k-instruct" : "phi3:mini"),
    timeoutMs,
    maxOutputTokens: Number(options["max-output-tokens"]) || 8192,
    maxConcurrency: 1,
    circuitFailureThreshold: 5,
    circuitCooldownMs: 1000,
    warmUpEnabled: false
  });
  const health = await provider.healthCheck();
  if (!health.ok) throw new Error(`Provider is not healthy: ${JSON.stringify(health)}`);

  const samples = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const readings = buildReadings(batchSize, iteration);
    const started = performance.now();
    const result = await mapReadingBatch(readings, provider, {
      maxRetries: 0,
      minConfidence: Number(options["min-confidence"]) || 0.7
    }, { workerId: "direct-benchmark-worker" });
    const elapsedMs = performance.now() - started;
    samples.push({
      iteration,
      elapsed_ms: Number(elapsedMs.toFixed(3)),
      input_readings: result.inputCount,
      mapped_readings: result.mappedCount,
      safely_unmapped_readings: result.safelyUnmappedCount,
      output_received_readings: result.outcomes.filter((item) => item.slmOutputReceived).length,
      readings_per_second: Number((result.inputCount / (elapsedMs / 1000)).toFixed(4)),
      validation_failures: result.outcomes
        .filter((item) => item.safelyUnmapped)
        .map((item) => ({ reading_name: item.reading.reading_name, reason: item.validationFailureReason }))
    });
  }
  const result = {
    recorded_at: new Date().toISOString(),
    provider: provider.name,
    model: provider.model,
    server_identity: provider.serverIdentity,
    batch_size: batchSize,
    iterations,
    timeout_ms: timeoutMs,
    samples,
    average_readings_per_second: Number((samples.reduce((sum, item) => sum + item.readings_per_second, 0) / samples.length).toFixed(4)),
    note: "Direct provider benchmark only; this is not an end-to-end device-capacity validation."
  };
  if (options.output) {
    const output = path.resolve(options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
