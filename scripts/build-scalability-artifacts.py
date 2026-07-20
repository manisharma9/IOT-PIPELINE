from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "docs" / "scalability-results"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def find_results():
    return sorted(RESULTS.glob("scale-*/stage-result.json"), key=lambda path: path.stat().st_mtime)


def summary_row(result):
    pipeline = result.get("pipeline", {})
    generator = result.get("generator", {})
    config = result.get("configuration", {})
    return {
        "run_id": result.get("run_id"),
        "status": result.get("status"),
        "configured_devices": config.get("device_count"),
        "represented_devices": generator.get("represented_devices"),
        "households": generator.get("represented_households"),
        "telemetry_messages": generator.get("telemetry_attempted"),
        "normalized_readings": pipeline.get("normalized_readings"),
        "slm_called_readings": pipeline.get("slm_called_readings"),
        "slm_invocation_percentage": pipeline.get("slm_invocation_percentage"),
        "mapped_readings": pipeline.get("mapped_readings"),
        "safely_unmapped_readings": pipeline.get("safely_unmapped_readings"),
        "arrival_readings_per_second": pipeline.get("sustained_arrival_readings_per_second"),
        "completion_readings_per_second": pipeline.get("completion_readings_per_second"),
        "maximum_kafka_lag": pipeline.get("maximum_observed_kafka_lag"),
        "final_kafka_lag": (pipeline.get("final_kafka_lag") or {}).get("total"),
        "slm_p50_ms": pipeline.get("slm_latency_p50_ms"),
        "slm_p95_ms": pipeline.get("slm_latency_p95_ms"),
        "slm_p99_ms": pipeline.get("slm_latency_p99_ms"),
        "end_to_end_p50_ms": pipeline.get("end_to_end_p50_ms"),
        "end_to_end_p95_ms": pipeline.get("end_to_end_p95_ms"),
        "end_to_end_p99_ms": pipeline.get("end_to_end_p99_ms"),
        "duplicate_semantic_ids": pipeline.get("duplicate_semantic_ids"),
        "duplicate_ieee_ids": pipeline.get("duplicate_ieee_ids"),
        "processing_errors": pipeline.get("processing_errors"),
    }


def generate_chart(result_path: Path, output: Path):
    result = load_json(result_path)
    pipeline = result.get("pipeline", {})
    samples = load_jsonl(result_path.parent / "pipeline-samples.jsonl")
    times = []
    lags = []
    audited = []
    for sample in samples:
        try:
            times.append(datetime.fromisoformat(sample["recorded_at"].replace("Z", "+00:00")))
            lags.append((sample.get("kafka_lag") or {}).get("total") or 0)
            audited.append((sample.get("metrics") or {}).get("audited_readings") or 0)
        except (KeyError, ValueError):
            continue

    width, height = 2210, 1360
    image = Image.new("RGB", (width, height), "#f8fafc")
    draw = ImageDraw.Draw(image)
    regular = ImageFont.truetype("arial.ttf", 28)
    small = ImageFont.truetype("arial.ttf", 22)
    bold = ImageFont.truetype("arialbd.ttf", 32)
    title = ImageFont.truetype("arialbd.ttf", 46)
    draw.text((70, 50), "AD-FLEX mandatory SLM scalability evidence", fill="#0f172a", font=title)
    draw.text((70, 112), f"Run: {result.get('run_id')}  |  Status: {result.get('status')}", fill="#475569", font=small)

    panels = [(70, 175, 1055, 700), (1155, 175, 2140, 700),
              (70, 760, 1055, 1280), (1155, 760, 2140, 1280)]
    for bounds in panels:
        draw.rounded_rectangle(bounds, radius=14, fill="white", outline="#cbd5e1", width=2)

    def bar_panel(bounds, heading, labels, values, colors, formatter=lambda value: f"{value:.2f}"):
        left, top, right, bottom = bounds
        draw.text((left + 35, top + 28), heading, fill="#0f172a", font=bold)
        maximum = max([float(value or 0) for value in values] + [1])
        base_y = bottom - 78
        chart_top = top + 105
        gap = (right - left - 90) / max(1, len(values))
        bar_width = min(145, gap * 0.56)
        for index, (label, raw_value, color) in enumerate(zip(labels, values, colors)):
            value = float(raw_value or 0)
            x = left + 55 + gap * index + (gap - bar_width) / 2
            bar_height = (base_y - chart_top) * value / maximum
            draw.rounded_rectangle((x, base_y - bar_height, x + bar_width, base_y), radius=6, fill=color)
            value_text = formatter(value)
            box = draw.textbbox((0, 0), value_text, font=small)
            draw.text((x + (bar_width - (box[2] - box[0])) / 2, base_y - bar_height - 34), value_text, fill="#334155", font=small)
            label_box = draw.textbbox((0, 0), label, font=small)
            draw.text((x + (bar_width - (label_box[2] - label_box[0])) / 2, base_y + 18), label, fill="#475569", font=small)

    bar_panel(
        panels[0], "Reading throughput (readings/s)",
        ["Arrival", "Completion"],
        [pipeline.get("sustained_arrival_readings_per_second"), pipeline.get("completion_readings_per_second")],
        ["#2563eb", "#059669"],
    )
    bar_panel(
        panels[1], "Measured latency", ["SLM p50", "SLM p95", "SLM p99", "E2E p95"],
        [pipeline.get("slm_latency_p50_ms"), pipeline.get("slm_latency_p95_ms"),
         pipeline.get("slm_latency_p99_ms"), pipeline.get("end_to_end_p95_ms")],
        ["#0ea5e9", "#f59e0b", "#ef4444", "#7c3aed"],
        lambda value: f"{value / 1000:.1f}s",
    )

    left, top, right, bottom = panels[2]
    draw.text((left + 35, top + 28), "Backlog and durable progress", fill="#0f172a", font=bold)
    if times and len(times) > 1:
        elapsed = [(value - times[0]).total_seconds() for value in times]
        max_x = max(elapsed) or 1
        max_y = max(lags + audited + [1])
        graph = (left + 65, top + 105, right - 40, bottom - 65)
        draw.line((graph[0], graph[3], graph[2], graph[3]), fill="#94a3b8", width=2)
        draw.line((graph[0], graph[1], graph[0], graph[3]), fill="#94a3b8", width=2)
        for series, color in ((lags, "#dc2626"), (audited, "#059669")):
            points = [(graph[0] + x / max_x * (graph[2] - graph[0]),
                       graph[3] - y / max_y * (graph[3] - graph[1]))
                      for x, y in zip(elapsed, series)]
            draw.line(points, fill=color, width=5)
        draw.text((left + 70, bottom - 48), "Kafka lag", fill="#dc2626", font=small)
        draw.text((left + 255, bottom - 48), "Terminal audits", fill="#059669", font=small)

    normalized = pipeline.get("normalized_readings") or 0
    mapped = pipeline.get("mapped_readings") or 0
    unmapped = pipeline.get("safely_unmapped_readings") or 0
    missing = max(0, normalized - mapped - unmapped)
    bar_panel(panels[3], "Reading outcomes at stage deadline",
              ["Mapped", "Safe unmapped", "Incomplete"], [mapped, unmapped, missing],
              ["#059669", "#f59e0b", "#dc2626"], lambda value: f"{int(value)}")

    draw.text((70, 1310), "Measured local evidence only.  No real device execution.  A failed gate is not promoted as capacity.", fill="#475569", font=regular)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--result", help="Specific stage-result.json; defaults to latest")
    args = parser.parse_args()
    paths = find_results()
    if not paths:
        raise SystemExit("No completed stage-result.json files were found.")
    selected = Path(args.result).resolve() if args.result else paths[-1]
    rows = [summary_row(load_json(path)) for path in paths]

    stages = []
    for device_count in (100, 1000, 5000, 10000):
        matching = [row for row in rows if row["configured_devices"] == device_count]
        stages.append(matching[-1] if matching else {
            "configured_devices": device_count,
            "status": "not_run_due_to_prior_gate",
        })

    combined = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "selected_evidence_run": str(selected.relative_to(ROOT)),
        "stages": stages,
        "provider_benchmarks": [
            load_json(path) for path in sorted(RESULTS.glob("provider-benchmark-batch-*.json"))
        ],
        "claim_boundary": {
            "generator_population_represented": 10000,
            "end_to_end_10000_validated": False,
            "million_device_validated": False,
        },
    }
    (RESULTS / "scalability-validation-results.json").write_text(
        json.dumps(combined, indent=2) + "\n", encoding="utf-8"
    )
    all_fields = sorted({key for row in stages for key in row})
    with (RESULTS / "scalability-stage-summary.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=all_fields)
        writer.writeheader()
        writer.writerows(stages)
    generate_chart(selected, RESULTS / "scalability-validation-charts.png")


if __name__ == "__main__":
    main()
