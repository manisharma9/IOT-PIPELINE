"use strict";

const fs = require("node:fs");
const { queryRunMetrics, readKafkaLag, readResources } = require("./run-scale-stage");

function parseArgs(argv = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    values[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  }
  return values;
}

async function main() {
  const args = parseArgs();
  if (!args["started-at"] || !args.output) throw new Error("started-at and output are required");
  const intervalMs = Math.max(1000, Number(args["interval-ms"]) || 5000);
  const consumerGroup = args["consumer-group"] || process.env.SEMANTIC_CONNECTOR_GROUP_ID;
  let running = true;
  const stop = () => { running = false; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  while (running) {
    const sample = {
      recorded_at: new Date().toISOString(),
      kafka_lag: readKafkaLag(consumerGroup),
      metrics: queryRunMetrics(args["started-at"]),
      resources: readResources()
    };
    fs.appendFileSync(args.output, `${JSON.stringify(sample)}\n`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
