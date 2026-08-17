"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    result[argv[index].replace(/^--/, "")] = argv[index + 1];
  }
  return result;
}

function walk(directory, filename, results = []) {
  if (!fs.existsSync(directory)) return results;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, filename, results);
    else if (entry.name === filename) results.push(target);
  }
  return results;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgChart({ title, labels, series, yLabel }) {
  const width = 1120;
  const height = 620;
  const margin = { top: 90, right: 40, bottom: 100, left: 100 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = series.flatMap((item) => item.values).map(Number).filter(Number.isFinite);
  const maximum = Math.max(...values, 1) * 1.12;
  const groupWidth = plotWidth / Math.max(labels.length, 1);
  const barWidth = Math.min(70, groupWidth / Math.max(series.length + 1, 2));
  const colors = ["#55d7e7", "#63dd8b", "#f4b45f", "#ef6b7a"];
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#07111f"/>',
    `<text x="${margin.left}" y="45" fill="#f8fafc" font-family="Arial" font-size="26" font-weight="700">${escapeXml(title)}</text>`,
    `<text x="24" y="${margin.top + plotHeight / 2}" fill="#94a3b8" font-family="Arial" font-size="14" transform="rotate(-90 24 ${margin.top + plotHeight / 2})">${escapeXml(yLabel)}</text>`
  ];
  for (let tick = 0; tick <= 5; tick += 1) {
    const value = maximum * tick / 5;
    const y = margin.top + plotHeight - plotHeight * tick / 5;
    lines.push(`<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#243247" stroke-width="1"/>`);
    lines.push(`<text x="${margin.left - 12}" y="${y + 5}" fill="#94a3b8" font-family="Arial" font-size="12" text-anchor="end">${value.toFixed(value < 10 ? 2 : 0)}</text>`);
  }
  labels.forEach((label, labelIndex) => {
    const groupX = margin.left + labelIndex * groupWidth;
    series.forEach((item, seriesIndex) => {
      const value = Number(item.values[labelIndex] || 0);
      const barHeight = plotHeight * value / maximum;
      const x = groupX + groupWidth / 2 - (series.length * barWidth) / 2 + seriesIndex * barWidth;
      const y = margin.top + plotHeight - barHeight;
      lines.push(`<rect x="${x}" y="${y}" width="${barWidth - 5}" height="${barHeight}" rx="3" fill="${colors[seriesIndex % colors.length]}"/>`);
    });
    lines.push(`<text x="${groupX + groupWidth / 2}" y="${margin.top + plotHeight + 30}" fill="#cbd5e1" font-family="Arial" font-size="13" text-anchor="middle">${escapeXml(label)}</text>`);
  });
  series.forEach((item, index) => {
    const x = margin.left + index * 210;
    lines.push(`<rect x="${x}" y="${height - 38}" width="14" height="14" rx="2" fill="${colors[index % colors.length]}"/>`);
    lines.push(`<text x="${x + 22}" y="${height - 26}" fill="#cbd5e1" font-family="Arial" font-size="13">${escapeXml(item.name)}</text>`);
  });
  lines.push("</svg>");
  return lines.join("\n");
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function memoryUsageMiB(value) {
  const text = String(value || "").split("/")[0].trim();
  const match = text.match(/^([\d.]+)\s*(B|KiB|MiB|GiB)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const factor = {
    b: 1 / (1024 * 1024),
    kib: 1 / 1024,
    mib: 1,
    gib: 1024
  }[match[2].toLowerCase()];
  return Number((amount * factor).toFixed(3));
}

function percent(value) {
  const parsed = Number(String(value || "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeRunResources(root, result) {
  const runDirectory = path.dirname(path.join(root, result.evidence_file));
  const generator = readJsonLines(path.join(runDirectory, "generator-resources.jsonl"));
  const resources = readJsonLines(path.join(runDirectory, "resource-samples.jsonl"));
  const containers = {};
  let gpuMaximumUtilizationPercent = null;
  let gpuMaximumMemoryMiB = null;

  for (const sample of resources) {
    for (const container of sample.containers || []) {
      const current = containers[container.name] || {
        maximum_cpu_percent: null,
        maximum_memory_mib: null
      };
      const cpu = percent(container.cpu_percent);
      const memory = memoryUsageMiB(container.memory_usage);
      current.maximum_cpu_percent = Math.max(current.maximum_cpu_percent ?? 0, cpu ?? 0);
      current.maximum_memory_mib = Math.max(current.maximum_memory_mib ?? 0, memory ?? 0);
      containers[container.name] = current;
    }
    const gpu = sample.gpu || {};
    if (Number.isFinite(Number(gpu.utilization_percent))) {
      gpuMaximumUtilizationPercent = Math.max(
        gpuMaximumUtilizationPercent ?? 0,
        Number(gpu.utilization_percent)
      );
    }
    if (Number.isFinite(Number(gpu.memory_used_mib))) {
      gpuMaximumMemoryMiB = Math.max(
        gpuMaximumMemoryMiB ?? 0,
        Number(gpu.memory_used_mib)
      );
    }
  }

  const generatorMaximumRssBytes = generator.reduce(
    (maximum, sample) => Math.max(maximum, Number(sample.rss_bytes || 0)),
    0
  );
  const generatorMaximumCpuPercent = generator.reduce(
    (maximum, sample) => Math.max(maximum, Number(sample.cpu_percent || 0)),
    0
  );
  const assets = Number(result.configuration.device_count || 0);
  const backlogClearanceSeconds = Math.max(
    0,
    (
      Date.parse(result.pipeline.last_audited_at) -
      Date.parse(result.generator.completed_at)
    ) / 1000
  );
  return {
    run_id: result.run_id,
    assets,
    generator_maximum_rss_bytes: generatorMaximumRssBytes,
    generator_maximum_rss_mib: Number(
      (generatorMaximumRssBytes / (1024 * 1024)).toFixed(3)
    ),
    generator_maximum_cpu_percent: generator.some(
      (sample) => Number.isFinite(Number(sample.cpu_percent))
    )
      ? Number(generatorMaximumCpuPercent.toFixed(3))
      : null,
    generator_rss_bytes_per_virtual_asset: assets
      ? Number((generatorMaximumRssBytes / assets).toFixed(3))
      : null,
    gpu_maximum_utilization_percent: gpuMaximumUtilizationPercent,
    gpu_maximum_memory_mib: gpuMaximumMemoryMiB,
    wall_clock_seconds: Number(
      ((Date.parse(result.completed_at) - Date.parse(result.started_at)) / 1000).toFixed(3)
    ),
    backlog_clearance_seconds: Number(backlogClearanceSeconds.toFixed(3)),
    containers
  };
}

function latestPassedByStage(results) {
  const selected = new Map();
  for (const result of results
    .filter((item) => item.status === "passed" && item.test_mode === "functional")
    .sort((left, right) => Date.parse(left.completed_at) - Date.parse(right.completed_at))) {
    selected.set(Number(result.configuration.device_count), result);
  }
  return [...selected.values()].sort(
    (left, right) => left.configuration.device_count - right.configuration.device_count
  );
}

function buildScaleOutProjection(result, options = {}) {
  if (!result) return null;
  const completionRate = Number(result.pipeline.completion_readings_per_second);
  const reportingIntervalSeconds = Number(options.reportingIntervalSeconds || 900);
  const planningMargin = Number(options.planningMargin || 1.3);
  if (!(completionRate > 0) || !(reportingIntervalSeconds > 0)) {
    throw new Error("A positive measured completion rate and reporting interval are required.");
  }
  const populations = options.populations || [10000, 100000, 1000000];
  return {
    generated_at: new Date().toISOString(),
    status: "modeled_not_validated",
    source_run_id: result.run_id,
    measured_completion_readings_per_second: completionRate,
    reporting_interval_seconds: reportingIntervalSeconds,
    planning_margin: planningMargin,
    formula:
      "ceil((assets * readings_per_update / reporting_interval_seconds) / measured_completion_readings_per_second * planning_margin)",
    scenarios: populations.flatMap((assets) => [1, 3].map((readingsPerUpdate) => {
      const telemetryRate = assets / reportingIntervalSeconds;
      const semanticRate = telemetryRate * readingsPerUpdate;
      return {
        assets,
        readings_per_update: readingsPerUpdate,
        telemetry_messages_per_second: Number(telemetryRate.toFixed(4)),
        semantic_readings_per_second: Number(semanticRate.toFixed(4)),
        local_worker_capacity_equivalents: Math.ceil(
          semanticRate / completionRate * planningMargin
        )
      };
    })),
    warning:
      "Local-worker capacity equivalents are not production GPU replica recommendations. Candidate vLLM hardware must be benchmarked."
  };
}

function main() {
  const options = parseArgs();
  const root = path.resolve(options.root || "docs/scalability-results");
  fs.mkdirSync(root, { recursive: true });
  const results = walk(root, "stage-result.json").map((file) => ({
    ...JSON.parse(fs.readFileSync(file, "utf8")),
    evidence_file: path.relative(root, file).replaceAll("\\", "/")
  }));
  const stages = latestPassedByStage(results);
  const resourceSummaries = stages.map((result) => summarizeRunResources(root, result));
  fs.writeFileSync(
    path.join(root, "stage-results.json"),
    `${JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(root, "resource-summary.json"),
    `${JSON.stringify({ generated_at: new Date().toISOString(), runs: resourceSummaries }, null, 2)}\n`
  );

  const rows = stages.map((result, index) => ({
    run_id: result.run_id,
    assets: result.configuration.device_count,
    households: result.generator.represented_households,
    classification: result.classification,
    readings: result.generator.readings_generated,
    slm_invocation_percent: result.pipeline.slm_invocation_percentage,
    mapping_acceptance_percent: result.pipeline.slm_acceptance_percentage,
    safely_unmapped_percent: result.pipeline.safely_unmapped_percentage,
    arrival_rps: result.pipeline.sustained_arrival_readings_per_second,
    completion_rps: result.pipeline.completion_readings_per_second,
    p50_ms: result.pipeline.slm_latency_p50_ms,
    p95_ms: result.pipeline.slm_latency_p95_ms,
    p99_ms: result.pipeline.slm_latency_p99_ms,
    max_lag: result.pipeline.maximum_observed_kafka_lag,
    final_lag: result.pipeline.final_kafka_lag?.total,
    gateway_retries: result.generator.gateway_retry_count || 0,
    backlog_clearance_seconds: resourceSummaries[index].backlog_clearance_seconds,
    generator_maximum_rss_mib: resourceSummaries[index].generator_maximum_rss_mib,
    generator_maximum_cpu_percent:
      resourceSummaries[index].generator_maximum_cpu_percent,
    gpu_maximum_utilization_percent:
      resourceSummaries[index].gpu_maximum_utilization_percent,
    drops: result.generator.telemetry_gateway_failed,
    duplicates: Number(result.pipeline.duplicate_semantic_ids || 0) +
      Number(result.pipeline.duplicate_ieee_ids || 0)
  }));
  const headers = rows.length ? Object.keys(rows[0]) : [];
  fs.writeFileSync(
    path.join(root, "stage-summary.csv"),
    `${headers.map(csvValue).join(",")}\n${rows.map((row) =>
      headers.map((header) => csvValue(row[header])).join(",")
    ).join("\n")}${rows.length ? "\n" : ""}`
  );

  const labels = rows.map((row) => `${row.assets} assets`);
  fs.writeFileSync(path.join(root, "throughput-chart.svg"), svgChart({
    title: "Measured arrival and completion throughput",
    labels,
    yLabel: "Readings per second",
    series: [
      { name: "Arrival", values: rows.map((row) => row.arrival_rps) },
      { name: "Durable completion", values: rows.map((row) => row.completion_rps) }
    ]
  }));
  fs.writeFileSync(path.join(root, "latency-chart.svg"), svgChart({
    title: "Measured SLM inference latency",
    labels,
    yLabel: "Milliseconds",
    series: [
      { name: "p50", values: rows.map((row) => row.p50_ms) },
      { name: "p95", values: rows.map((row) => row.p95_ms) },
      { name: "p99", values: rows.map((row) => row.p99_ms) }
    ]
  }));
  fs.writeFileSync(path.join(root, "lag-chart.svg"), svgChart({
    title: "Maximum and final semantic consumer lag",
    labels,
    yLabel: "Readings",
    series: [
      { name: "Maximum lag", values: rows.map((row) => row.max_lag) },
      { name: "Final lag", values: rows.map((row) => row.final_lag) }
    ]
  }));

  const largest = stages.at(-1);
  const scaleOutProjection = buildScaleOutProjection(largest);
  if (scaleOutProjection) {
    fs.writeFileSync(
      path.join(root, "scale-out-model.json"),
      `${JSON.stringify(scaleOutProjection, null, 2)}\n`
    );
  }
  const categories = largest?.generator?.population?.categories || {};
  const categoryRows = Object.entries(categories).sort((left, right) => right[1] - left[1]);
  fs.writeFileSync(path.join(root, "device-category-chart.svg"), svgChart({
    title: "Validated device category distribution",
    labels: categoryRows.map(([category]) => category.replaceAll("_", " ")),
    yLabel: "Assets",
    series: [{ name: "Assets", values: categoryRows.map(([, count]) => count) }]
  }));

  process.stdout.write(`Evidence summary built from ${results.length} result file(s); ${stages.length} passed functional stage(s).\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  buildScaleOutProjection,
  latestPassedByStage,
  memoryUsageMiB,
  parseArgs,
  readJsonLines,
  summarizeRunResources,
  svgChart,
  walk
};
