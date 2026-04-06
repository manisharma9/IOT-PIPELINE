const values = {
  tempValue: ["27.94 C", "28.02 C", "27.31 C", "26.88 C", "28.15 C"],
  humidityValue: ["59.3 %", "58.46 %", "60.12 %", "57.9 %", "61.4 %"],
  meterValue: ["984.65 kWh", "986.11 kWh", "990.22 kWh", "995.10 kWh"],
  doorValue: ["Open", "Closed"],
  motionValue: ["Motion Detected", "No Motion"],
  co2Value: ["653.02 ppm", "600.19 ppm", "612.84 ppm", "640.55 ppm"],
  pressureValue: ["1006.08 hPa", "1001.31 hPa", "1009.20 hPa"],
  lightValue: ["398.88 lux", "410.21 lux", "382.64 lux"],
  batteryValue: ["85.79 %", "85.56 %", "84.92 %"],
  flowValue: ["19.31 L/min", "18.82 L/min", "20.10 L/min"]
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function updateMetrics() {
  Object.keys(values).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = pick(values[id]);
  });
}

function drawLineChart(canvasId, dataPoints, lineColor = "#60a5fa") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width - 24;
  canvas.height = 190;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const y = (h / 5) * i + 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min || 1;

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.beginPath();

  dataPoints.forEach((point, index) => {
    const x = (w / (dataPoints.length - 1)) * index;
    const y = h - ((point - min) / range) * (h - 30) - 15;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  ctx.fillStyle = lineColor;
  dataPoints.forEach((point, index) => {
    const x = (w / (dataPoints.length - 1)) * index;
    const y = h - ((point - min) / range) * (h - 30) - 15;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderCharts() {
  drawLineChart("tempChart", [24.8, 25.2, 26.1, 27.4, 27.9, 28.0, 27.6]);
  drawLineChart("humidityChart", [62, 61, 60.4, 59.9, 59.3, 58.8, 59.4], "#38bdf8");
  drawLineChart("meterChart", [950, 955, 962, 971, 978, 984, 990], "#4ade80");
  drawLineChart("co2Chart", [580, 601, 615, 630, 653, 640, 620], "#f59e0b");
}

const dittoJson = [
  {
    thingId: "smarthome:dev001",
    attributes: { device_id: "dev001", device_type: "temperature_sensor" },
    features: {
      temperature: {
        properties: {
          value: 27.94,
          unit: "C",
          "@type": "saref:Temperature",
          "saref:hasValue": 27.94,
          "saref:isMeasuredIn": "saref:DegreeCelsius"
        }
      }
    }
  },
  {
    thingId: "smarthome:dev010",
    attributes: { device_id: "dev010", device_type: "door_sensor" },
    features: {
      door: {
        properties: {
          value: 0,
          unit: "state",
          "@type": "saref:OpenCloseState",
          "saref:hasValue": 0,
          "saref:isMeasuredIn": "saref:State"
        }
      }
    }
  }
];

const ngsiJson = [
  {
    ngsi_id: "urn:ngsi-ld:TemperatureSensor:dev001",
    ngsi_payload: {
      id: "urn:ngsi-ld:TemperatureSensor:dev001",
      type: "TemperatureSensor",
      temperature: { type: "Property", value: 27.94 },
      unit: { type: "Property", value: "C" },
      sarefType: { type: "Property", value: "saref:Temperature" },
      sarefUnit: { type: "Property", value: "saref:DegreeCelsius" },
      "@context": ["https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld"]
    }
  },
  {
    ngsi_id: "urn:ngsi-ld:DoorSensor:dev010",
    ngsi_payload: {
      id: "urn:ngsi-ld:DoorSensor:dev010",
      type: "DoorSensor",
      doorState: { type: "Property", value: 0 },
      unit: { type: "Property", value: "state" },
      sarefType: { type: "Property", value: "saref:OpenCloseState" },
      sarefUnit: { type: "Property", value: "saref:State" },
      "@context": ["https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld"]
    }
  }
];

document.getElementById("dittoJson").textContent = JSON.stringify(dittoJson, null, 2);
document.getElementById("ngsiJson").textContent = JSON.stringify(ngsiJson, null, 2);

window.addEventListener("load", () => {
  renderCharts();
  updateMetrics();
});

window.addEventListener("resize", renderCharts);
setInterval(updateMetrics, 4000);