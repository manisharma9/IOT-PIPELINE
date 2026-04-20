const iconSet = {
  temperature: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 14.5V5a2.5 2.5 0 0 0-5 0v9.5a4.5 4.5 0 1 0 5 0Z" />
      <path d="M9.5 10.5h2.5" />
    </svg>
  `,
  humidity: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5c3 4 5.5 6.7 5.5 10a5.5 5.5 0 1 1-11 0c0-3.3 2.5-6 5.5-10Z" />
    </svg>
  `,
  meter: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 14a8 8 0 1 1 16 0" />
      <path d="m12 14 4-4" />
      <path d="M7 18h10" />
    </svg>
  `,
  door: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h9a1 1 0 0 1 1 1v14H7z" />
      <path d="M10.5 12.5h.01" />
    </svg>
  `,
  motion: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12c2.4-3.4 5-5 8-5s5.6 1.6 8 5c-2.4 3.4-5 5-8 5s-5.6-1.6-8-5Z" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  `,
  co2: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17h9a3 3 0 0 0 .3-6A4.5 4.5 0 0 0 7.6 10 3.5 3.5 0 0 0 7 17Z" />
      <path d="M8 20h8" />
    </svg>
  `,
  pressure: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.5" />
      <path d="m12 12 3-4" />
      <path d="M12 6v1" />
    </svg>
  `,
  light: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5a5 5 0 0 0-3 9v1.5h6V13.5a5 5 0 0 0-3-9Z" />
      <path d="M10 18h4" />
      <path d="M9.5 20h5" />
    </svg>
  `,
  battery: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="8" width="14" height="8" rx="2" />
      <path d="M18 10h2v4h-2" />
      <path d="M7 12h4" />
    </svg>
  `,
  water: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h10" />
      <path d="M10 6v4" />
      <path d="M14 10c0 4-4 4-4 7a3 3 0 1 0 6 0c0-3-2-3-2-7Z" />
    </svg>
  `
};

const sensors = [
  {
    key: "temperature",
    label: "Temperature Sensor",
    icon: "temperature",
    entityType: "temperature_sensor",
    deviceId: "dev001",
    thingId: "smarthome:dev001",
    attributeName: "temperature",
    featureName: "temperature",
    ngsiId: "urn:ngsi-ld:TemperatureSensor:dev001",
    ngsiType: "TemperatureSensor",
    ngsiProperty: "temperature",
    sarefType: "saref:Temperature",
    sarefUnit: "saref:DegreeCelsius",
    type: "number",
    unit: "C",
    decimals: 2,
    tone: "#7fd5ff",
    status: "Comfortable",
    summary: "Indoor temperature is currently slightly warm but still within a comfortable occupied-home range.",
    decisionHint: "Useful for comfort and climate control decisions.",
    insight: "Comfort is holding steady",
    changeLabel: "Warm side of normal",
    activityCount: 82,
    sequence: [27.94, 28.02, 27.31, 26.88, 28.15],
    history: [24.8, 25.2, 26.1, 27.4, 27.9, 28.0, 27.6]
  },
  {
    key: "humidity",
    label: "Humidity Sensor",
    icon: "humidity",
    entityType: "humidity_sensor",
    deviceId: "dev002",
    thingId: "smarthome:dev002",
    attributeName: "humidity",
    featureName: "humidity",
    ngsiId: "urn:ngsi-ld:HumiditySensor:dev002",
    ngsiType: "HumiditySensor",
    ngsiProperty: "humidity",
    sarefType: "saref:Humidity",
    sarefUnit: "saref:Percent",
    type: "number",
    unit: "%",
    decimals: 1,
    tone: "#7ce8d0",
    status: "Balanced",
    summary: "Humidity levels look balanced, helping the home feel comfortable and well-managed.",
    decisionHint: "Useful for comfort and ventilation decisions.",
    insight: "Moisture is balanced",
    changeLabel: "Healthy indoor level",
    activityCount: 76,
    sequence: [59.3, 58.46, 60.12, 57.9, 61.4],
    history: [62.0, 61.4, 60.8, 60.1, 59.6, 59.3, 58.8]
  },
  {
    key: "meter",
    label: "Smart Meter",
    icon: "meter",
    entityType: "smart_meter",
    deviceId: "dev003",
    thingId: "smarthome:dev003",
    attributeName: "meter",
    featureName: "meter",
    ngsiId: "urn:ngsi-ld:SmartMeter:dev003",
    ngsiType: "SmartMeter",
    ngsiProperty: "energy",
    sarefType: "saref:Energy",
    sarefUnit: "saref:KilowattHour",
    type: "number",
    unit: "kWh",
    decimals: 2,
    tone: "#ffbf74",
    status: "Active",
    summary: "Energy use is building through the day in a way that looks normal for an occupied home.",
    decisionHint: "Useful for tracking usage and energy efficiency.",
    insight: "Usage is moving upward",
    changeLabel: "Demand is increasing",
    activityCount: 92,
    sequence: [984.65, 986.11, 990.22, 995.1, 997.24],
    history: [950.0, 955.0, 962.0, 971.0, 978.0, 984.0, 990.0]
  },
  {
    key: "door",
    label: "Door Sensor",
    icon: "door",
    entityType: "door_sensor",
    deviceId: "dev010",
    thingId: "smarthome:dev010",
    attributeName: "door",
    featureName: "door",
    ngsiId: "urn:ngsi-ld:DoorSensor:dev010",
    ngsiType: "DoorSensor",
    ngsiProperty: "doorState",
    sarefType: "saref:OpenCloseState",
    sarefUnit: "saref:State",
    type: "state",
    unit: "state",
    decimals: 0,
    tone: "#8ea6ff",
    status: "Secure",
    summary: "The main entry is currently closed, so the home appears secure right now.",
    decisionHint: "Useful for safety and access monitoring.",
    insight: "Entry looks secure",
    changeLabel: "No open access now",
    activityCount: 55,
    sequence: ["Closed", "Closed", "Open", "Closed", "Closed"],
    history: [0, 0, 1, 0, 0, 0, 1]
  },
  {
    key: "motion",
    label: "Motion Sensor",
    icon: "motion",
    entityType: "motion_sensor",
    deviceId: "dev011",
    thingId: "smarthome:dev011",
    attributeName: "motion",
    featureName: "motion",
    ngsiId: "urn:ngsi-ld:MotionSensor:dev011",
    ngsiType: "MotionSensor",
    ngsiProperty: "motionState",
    sarefType: "saref:Occupancy",
    sarefUnit: "saref:State",
    type: "state",
    unit: "state",
    decimals: 0,
    tone: "#ff8d9a",
    status: "Occupied",
    summary: "Motion has been detected recently, showing current activity in the monitored space.",
    decisionHint: "Useful for understanding occupancy and live activity.",
    insight: "Movement has been seen",
    changeLabel: "Live activity detected",
    activityCount: 63,
    sequence: [
      "Motion Detected",
      "No Motion",
      "Motion Detected",
      "Motion Detected",
      "No Motion"
    ],
    history: [0, 1, 0, 1, 1, 0, 1]
  },
  {
    key: "co2",
    label: "CO2 Sensor",
    icon: "co2",
    entityType: "co2_sensor",
    deviceId: "dev006",
    thingId: "smarthome:dev006",
    attributeName: "co2",
    featureName: "co2",
    ngsiId: "urn:ngsi-ld:CO2Sensor:dev006",
    ngsiType: "CO2Sensor",
    ngsiProperty: "co2",
    sarefType: "saref:AirQuality",
    sarefUnit: "saref:PartsPerMillion",
    type: "number",
    unit: "ppm",
    decimals: 2,
    tone: "#66c5ff",
    status: "Watch",
    summary: "CO2 is visible at a level worth watching, which is useful when discussing air quality and ventilation.",
    decisionHint: "Useful for air quality and ventilation decisions.",
    insight: "Air quality is visible",
    changeLabel: "Slightly elevated indoor air",
    activityCount: 68,
    sequence: [653.02, 600.19, 612.84, 640.55, 658.9],
    history: [580.0, 601.0, 615.0, 630.0, 653.0, 640.0, 620.0]
  },
  {
    key: "pressure",
    label: "Pressure Sensor",
    icon: "pressure",
    entityType: "pressure_sensor",
    deviceId: "dev007",
    thingId: "smarthome:dev007",
    attributeName: "pressure",
    featureName: "pressure",
    ngsiId: "urn:ngsi-ld:PressureSensor:dev007",
    ngsiType: "PressureSensor",
    ngsiProperty: "pressure",
    sarefType: "saref:Pressure",
    sarefUnit: "saref:HectoPascal",
    type: "number",
    unit: "hPa",
    decimals: 2,
    tone: "#8db9ff",
    status: "Stable",
    summary: "Pressure is steady, giving useful background context for wider environmental conditions.",
    decisionHint: "Useful as supporting environmental context.",
    insight: "Background conditions are stable",
    changeLabel: "Little change in pressure",
    activityCount: 60,
    sequence: [1006.08, 1001.31, 1009.2, 1005.74, 1006.44],
    history: [1001.8, 1002.6, 1003.4, 1004.7, 1005.5, 1006.08, 1005.7]
  },
  {
    key: "light",
    label: "Light Sensor",
    icon: "light",
    entityType: "light_sensor",
    deviceId: "dev008",
    thingId: "smarthome:dev008",
    attributeName: "light",
    featureName: "light",
    ngsiId: "urn:ngsi-ld:LightSensor:dev008",
    ngsiType: "LightSensor",
    ngsiProperty: "light",
    sarefType: "saref:Light",
    sarefUnit: "saref:Lux",
    type: "number",
    unit: "lux",
    decimals: 2,
    tone: "#ffd36b",
    status: "Bright",
    summary: "Lighting remains consistent, helping explain comfort and current use of the space.",
    decisionHint: "Useful for occupancy and ambience checks.",
    insight: "Lighting looks consistent",
    changeLabel: "Brightness is steady",
    activityCount: 58,
    sequence: [398.88, 410.21, 382.64, 401.14, 398.62],
    history: [340.0, 355.6, 371.2, 384.1, 392.4, 398.88, 405.2]
  },
  {
    key: "battery",
    label: "Battery Sensor",
    icon: "battery",
    entityType: "battery_sensor",
    deviceId: "dev009",
    thingId: "smarthome:dev009",
    attributeName: "battery",
    featureName: "battery",
    ngsiId: "urn:ngsi-ld:BatterySensor:dev009",
    ngsiType: "BatterySensor",
    ngsiProperty: "batteryLevel",
    sarefType: "saref:BatteryLevel",
    sarefUnit: "saref:Percent",
    type: "number",
    unit: "%",
    decimals: 2,
    tone: "#7df0a7",
    status: "Healthy",
    summary: "Battery level remains healthy, suggesting the monitoring setup is ready for continued use.",
    decisionHint: "Useful for device readiness and maintenance planning.",
    insight: "Device health looks good",
    changeLabel: "Strong remaining charge",
    activityCount: 72,
    sequence: [85.79, 85.56, 84.92, 84.4, 84.16],
    history: [91.4, 89.8, 88.9, 87.5, 86.3, 85.79, 85.1]
  },
  {
    key: "water",
    label: "Water Flow Sensor",
    icon: "water",
    entityType: "water_flow_sensor",
    deviceId: "dev012",
    thingId: "smarthome:dev012",
    attributeName: "water_flow",
    featureName: "water_flow",
    ngsiId: "urn:ngsi-ld:WaterFlowSensor:dev012",
    ngsiType: "WaterFlowSensor",
    ngsiProperty: "waterFlow",
    sarefType: "saref:Flow",
    sarefUnit: "saref:LiterPerMinute",
    type: "number",
    unit: "L/min",
    decimals: 2,
    tone: "#7ce8ff",
    status: "Normal",
    summary: "Water flow is steady, giving a clear view of current household utility use.",
    decisionHint: "Useful for spotting unusual utility usage.",
    insight: "Water use is easy to follow",
    changeLabel: "No unusual surge seen",
    activityCount: 64,
    sequence: [19.31, 18.82, 20.1, 19.14, 19.48],
    history: [15.8, 16.7, 17.4, 18.5, 18.9, 19.31, 19.0]
  }
];

const chartDefinitions = [
  { key: "temperature", title: "Temperature Sensor", subtitle: "Temperature trend" },
  { key: "humidity", title: "Humidity Sensor", subtitle: "Humidity trend" },
  { key: "meter", title: "Smart Meter", subtitle: "Smart meter trend" },
  { key: "co2", title: "CO2 Sensor", subtitle: "CO2 trend" },
  { key: "pressure", title: "Pressure Sensor", subtitle: "Pressure trend" },
  { key: "light", title: "Light Sensor", subtitle: "Light trend" },
  { key: "battery", title: "Battery Sensor", subtitle: "Battery trend" },
  { key: "water", title: "Water Flow Sensor", subtitle: "Water flow trend" }
];

const homeKpiKeys = ["temperature", "humidity", "meter", "co2", "door"];

const appState = {
  tick: 0,
  activeSensorIndex: 0,
  lastSync: new Date(),
  chartAnimations: new Map(),
  openCharts: new Set(),
  openAccordions: {
    twinState: new Set(),
    ngsiRecords: new Set(),
    processedRecords: new Set()
  }
};

const refs = {
  heroMetrics: document.getElementById("heroMetrics"),
  homeKpiGrid: document.getElementById("homeKpiGrid"),
  latestStatusList: document.getElementById("latestStatusList"),
  activityList: document.getElementById("activityList"),
  liveCarousel: document.getElementById("liveCarousel"),
  carouselDots: document.getElementById("carouselDots"),
  liveFocus: document.getElementById("liveFocus"),
  twinStateList: document.getElementById("twinStateList"),
  chartStack: document.getElementById("chartStack"),
  dataSummary: document.getElementById("dataSummary"),
  ngsiRecordList: document.getElementById("ngsiRecordList"),
  processedRecordList: document.getElementById("processedRecordList"),
  dittoJson: document.getElementById("dittoJson"),
  ngsiJson: document.getElementById("ngsiJson"),
  splashScreen: document.getElementById("splashScreen"),
  swipeHint: document.querySelector(".swipe-hint"),
  navButtons: Array.from(document.querySelectorAll(".nav-item")),
  sections: Array.from(document.querySelectorAll(".screen-section"))
};

function getSensor(key) {
  return sensors.find((sensor) => sensor.key === key);
}

function getSensorByEntityType(entityType) {
  return sensors.find((sensor) => sensor.entityType === entityType);
}

function getSequenceValue(sensor, offset = 0) {
  const index = ((appState.tick - offset) % sensor.sequence.length + sensor.sequence.length) % sensor.sequence.length;
  return sensor.sequence[index];
}

function getCurrentValue(sensor) {
  return getSequenceValue(sensor, 0);
}

function getRawValue(sensor, value) {
  if (sensor.type !== "state") {
    return value;
  }

  if (sensor.entityType === "door_sensor") {
    return value === "Open" ? 1 : 0;
  }

  return value === "Motion Detected" ? 1 : 0;
}

function formatSensorValue(sensor, value, includeUnit = true) {
  if (sensor.type === "state") {
    return value;
  }

  const formatted = Number(value).toFixed(sensor.decimals);
  return includeUnit ? `${formatted} ${sensor.unit}` : formatted;
}

function formatDbTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getProgress(sensor, value) {
  if (sensor.type === "state") {
    if (sensor.entityType === "door_sensor") {
      return value === "Closed" ? 84 : 40;
    }

    return value === "Motion Detected" ? 74 : 28;
  }

  const rangeValues = [...sensor.sequence, ...sensor.history];
  const min = Math.min(...rangeValues);
  const max = Math.max(...rangeValues);
  const normalized = ((value - min) / (max - min || 1)) * 100;
  return Math.max(18, Math.min(96, normalized));
}

function isAccordionOpen(group, key) {
  return appState.openAccordions[group].has(key);
}

function bindAccordionState(container, group) {
  Array.from(container.querySelectorAll(".accordion-card")).forEach((card) => {
    const key = card.dataset.openKey;

    card.addEventListener("toggle", () => {
      if (!key) {
        return;
      }

      if (card.open) {
        appState.openAccordions[group].add(key);
      } else {
        appState.openAccordions[group].delete(key);
      }
    });
  });
}

function buildNgsiPayload(sensor, value, createdAt) {
  return {
    id: sensor.ngsiId,
    type: sensor.ngsiType,
    [sensor.ngsiProperty]: {
      type: "Property",
      value: getRawValue(sensor, value)
    },
    unit: {
      type: "Property",
      value: sensor.unit
    },
    displayValue: {
      type: "Property",
      value: formatSensorValue(sensor, value)
    },
    entityType: {
      type: "Property",
      value: sensor.entityType
    },
    attributeName: {
      type: "Property",
      value: sensor.attributeName
    },
    sarefType: {
      type: "Property",
      value: sensor.sarefType
    },
    sarefUnit: {
      type: "Property",
      value: sensor.sarefUnit
    },
    observedAt: createdAt.toISOString(),
    "@context": ["https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld"]
  };
}

function buildProcessedRecords() {
  let nextId = 33652;
  const rows = [];

  sensors.forEach((sensor, sensorIndex) => {
    const sampleCount = sensor.type === "state" ? 2 : 3;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const value = getSequenceValue(sensor, sampleIndex);
      const createdAtMs = appState.lastSync.getTime() - (sensorIndex * 3 + sampleIndex) * 42000;
      const createdAt = new Date(createdAtMs);

      rows.push({
        id: nextId,
        entity_id: sensor.thingId,
        entity_type: sensor.entityType,
        attribute_name: sensor.attributeName,
        attribute_value: formatSensorValue(sensor, value),
        raw_value: getRawValue(sensor, value),
        unit: sensor.unit,
        saref_type: sensor.sarefType,
        saref_unit: sensor.sarefUnit,
        ngsi_id: sensor.ngsiId,
        ngsi_type: sensor.ngsiType,
        ngsi_property: sensor.ngsiProperty,
        created_at: formatDbTimestamp(createdAt),
        createdAtMs,
        ngsi_payload: buildNgsiPayload(sensor, value, createdAt)
      });

      nextId += 1;
    }
  });

  return rows.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

function buildLatestTwinState() {
  return sensors.map((sensor) => {
    const value = getCurrentValue(sensor);

    return {
      thing_id: sensor.thingId,
      device_id: sensor.deviceId,
      device_type: sensor.entityType,
      feature_name: sensor.featureName,
      latest_value: formatSensorValue(sensor, value),
      saref_type: sensor.sarefType,
      tone: sensor.tone,
      label: sensor.label
    };
  });
}

function buildLatestStatus(processedRecords) {
  const latestByEntity = new Map();

  processedRecords.forEach((record) => {
    if (!latestByEntity.has(record.entity_type)) {
      latestByEntity.set(record.entity_type, record);
    }
  });

  return Array.from(latestByEntity.values());
}

function buildNgsiRecords(processedRecords) {
  return processedRecords.slice(0, 10).map((record) => ({
    ngsi_id: record.ngsi_id,
    ngsi_type: record.ngsi_type,
    ngsi_property: record.ngsi_property,
    value_only: record.raw_value,
    unit: record.unit,
    display_value: record.attribute_value,
    entity_type: record.entity_type,
    attribute_name: record.attribute_name,
    saref_type: record.saref_type,
    saref_unit: record.saref_unit,
    created_at: record.created_at,
    ngsi_payload: record.ngsi_payload
  }));
}

function buildDittoRaw() {
  return sensors.map((sensor) => {
    const value = getCurrentValue(sensor);

    return {
      thingId: sensor.thingId,
      attributes: {
        device_id: sensor.deviceId,
        device_type: sensor.entityType
      },
      features: {
        [sensor.featureName]: {
          properties: {
            value: getRawValue(sensor, value),
            unit: sensor.unit,
            "@type": sensor.sarefType,
            "saref:isMeasuredIn": sensor.sarefUnit
          }
        }
      }
    };
  });
}

function buildDashboardData() {
  const processedRecords = buildProcessedRecords();
  const latestStatus = buildLatestStatus(processedRecords);
  const ngsiRecords = buildNgsiRecords(processedRecords);
  const twinState = buildLatestTwinState();
  const dittoRaw = buildDittoRaw();
  const rawNgsiPayloads = ngsiRecords.map((record) => ({
    ngsi_id: record.ngsi_id,
    ngsi_payload: record.ngsi_payload
  }));

  return {
    processedRecords,
    latestStatus,
    ngsiRecords,
    twinState,
    dittoRaw,
    rawNgsiPayloads
  };
}

function renderHeroMetrics(data) {
  const summaryTiles = [
    { label: "Live device values", value: `${sensors.length} devices` },
    { label: "Latest twin state", value: `${data.twinState.length} live rows` },
    { label: "Processed records", value: `${data.processedRecords.length} recent rows` },
    { label: "Last updated", value: formatTime(appState.lastSync) }
  ];

  refs.heroMetrics.innerHTML = summaryTiles
    .map(
      (tile) => `
        <div class="hero-metric">
          <span>${tile.label}</span>
          <strong>${tile.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderHomeKpis() {
  refs.homeKpiGrid.innerHTML = homeKpiKeys
    .map((key) => {
      const sensor = getSensor(key);
      const value = getCurrentValue(sensor);

      return `
        <article class="home-kpi-card" style="--tone:${sensor.tone}">
          <div class="home-kpi-top">
            <div class="home-kpi-title">
              <span class="icon-shell">${iconSet[sensor.icon]}</span>
              <div>
                <h3>${sensor.label}</h3>
                <p>${sensor.status}</p>
              </div>
            </div>
          </div>
          <div class="home-kpi-value">${formatSensorValue(sensor, value)}</div>
          <div class="home-kpi-meta">${sensor.summary}</div>
        </article>
      `;
    })
    .join("");
}

function renderLatestStatusList(data) {
  refs.latestStatusList.innerHTML = data.latestStatus
    .slice(0, 6)
    .map((record) => {
      const sensor = getSensorByEntityType(record.entity_type);

      return `
        <article class="status-card" style="--tone:${sensor.tone}">
          <div class="status-card-top">
            <div class="status-card-title">
              <span class="icon-shell">${iconSet[sensor.icon]}</span>
              <div>
                <h3>${sensor.label}</h3>
                <p>${record.attribute_name}</p>
              </div>
            </div>
            <span class="status-pill">${sensor.status}</span>
          </div>
          <div class="status-card-value">${record.attribute_value}</div>
          <div class="status-card-meta">Updated ${record.created_at}</div>
        </article>
      `;
    })
    .join("");
}

function renderActivityList() {
  const topActivity = [...sensors]
    .sort((left, right) => right.activityCount - left.activityCount)
    .slice(0, 6);

  refs.activityList.innerHTML = topActivity
    .map(
      (sensor) => `
        <div class="activity-row" style="--tone:${sensor.tone}">
          <div class="activity-head">
            <p class="activity-name">${sensor.label}</p>
            <div class="activity-meta">
              <strong>${sensor.activityCount}</strong>
              <span>recent updates</span>
            </div>
          </div>
          <div class="activity-bar">
            <span class="activity-fill" style="width:${sensor.activityCount}%"></span>
          </div>
        </div>
      `
    )
    .join("");
}

function createLiveCard(sensor, index) {
  const value = getCurrentValue(sensor);
  const isState = sensor.type === "state";

  return `
    <button
      class="live-card${index === appState.activeSensorIndex ? " is-active" : ""}"
      data-index="${index}"
      type="button"
      style="--tone:${sensor.tone}"
    >
      <div class="live-card-top">
        <span class="icon-shell">${iconSet[sensor.icon]}</span>
        <span class="status-pill">${sensor.status}</span>
      </div>
      <div class="metric-name">${sensor.label}</div>
      <div class="metric-value">
        <span
          class="metric-number${isState ? " is-text" : ""}"
          data-role="value"
          data-value="${isState ? value : Number(value).toFixed(sensor.decimals)}"
        >
          ${isState ? value : "0"}
        </span>
        ${isState ? "" : `<span class="metric-unit">${sensor.unit}</span>`}
      </div>
      <div class="metric-track">
        <span class="metric-fill" data-role="fill"></span>
      </div>
      <div class="metric-footer">
        <span>${sensor.insight}</span>
        <span>${sensor.changeLabel}</span>
      </div>
    </button>
  `;
}

function renderLiveCarousel() {
  refs.liveCarousel.innerHTML = sensors.map((sensor, index) => createLiveCard(sensor, index)).join("");

  refs.carouselDots.innerHTML = sensors
    .map(
      (_, index) => `
        <span class="carousel-dot${index === appState.activeSensorIndex ? " is-active" : ""}"></span>
      `
    )
    .join("");

  updateLiveCards(true);
  bindLiveCards();
  renderLiveFocus();
}

function animateNumber(element, target, decimals, initial = false) {
  const startValue = Number.parseFloat(element.dataset.value || "0");
  const from = initial ? 0 : startValue;
  const duration = initial ? 720 : 520;
  const startTime = performance.now();

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = from + (target - from) * eased;
    element.textContent = value.toFixed(decimals);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      element.dataset.value = target.toFixed(decimals);
      element.textContent = target.toFixed(decimals);
    }
  }

  requestAnimationFrame(frame);
}

function swapStateText(element, nextValue) {
  if (element.textContent === nextValue) {
    return;
  }

  element.classList.add("is-flip");

  setTimeout(() => {
    element.textContent = nextValue;
    element.dataset.value = nextValue;
  }, 120);

  setTimeout(() => {
    element.classList.remove("is-flip");
  }, 260);
}

function updateLiveCards(initial = false) {
  const cards = Array.from(refs.liveCarousel.querySelectorAll(".live-card"));

  cards.forEach((card, index) => {
    const sensor = sensors[index];
    const value = getCurrentValue(sensor);
    const valueEl = card.querySelector('[data-role="value"]');
    const fillEl = card.querySelector('[data-role="fill"]');

    if (sensor.type === "state") {
      swapStateText(valueEl, value);
    } else {
      animateNumber(valueEl, value, sensor.decimals, initial);
    }

    fillEl.style.width = `${getProgress(sensor, value)}%`;
    card.classList.toggle("is-active", index === appState.activeSensorIndex);
  });

  Array.from(refs.carouselDots.children).forEach((dot, index) => {
    dot.classList.toggle("is-active", index === appState.activeSensorIndex);
  });
}

function renderLiveFocus() {
  const sensor = sensors[appState.activeSensorIndex];
  const value = getCurrentValue(sensor);

  refs.liveFocus.style.setProperty("--tone", sensor.tone);
  refs.liveFocus.innerHTML = `
    <div class="focus-top">
      <div>
        <p class="eyebrow">What it means</p>
        <h3>${sensor.label}</h3>
      </div>
      <span class="focus-chip">${sensor.status}</span>
    </div>
    <div class="focus-value">${formatSensorValue(sensor, value)}</div>
    <p class="focus-copy">${sensor.summary}</p>
    <div class="focus-grid">
      <div class="focus-detail">
        <span>device_type</span>
        <strong>${sensor.entityType}</strong>
      </div>
      <div class="focus-detail">
        <span>feature_name</span>
        <strong>${sensor.featureName}</strong>
      </div>
      <div class="focus-detail">
        <span>Why it matters</span>
        <strong>${sensor.decisionHint}</strong>
      </div>
      <div class="focus-detail">
        <span>Updated</span>
        <strong>${formatTime(appState.lastSync)}</strong>
      </div>
    </div>
  `;
}

function bindLiveCards() {
  Array.from(refs.liveCarousel.querySelectorAll(".live-card")).forEach((card) => {
    card.addEventListener("click", () => {
      appState.activeSensorIndex = Number(card.dataset.index);
      updateLiveCards();
      renderLiveFocus();
      card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  });

  let scrollFrame = null;

  refs.liveCarousel.addEventListener("scroll", () => {
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
    }

    scrollFrame = requestAnimationFrame(() => {
      const cards = Array.from(refs.liveCarousel.querySelectorAll(".live-card"));
      const carouselRect = refs.liveCarousel.getBoundingClientRect();
      const carouselCenter = carouselRect.left + carouselRect.width / 2;
      let nearestIndex = appState.activeSensorIndex;
      let nearestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const distance = Math.abs(cardCenter - carouselCenter);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      if (nearestIndex !== appState.activeSensorIndex) {
        appState.activeSensorIndex = nearestIndex;
        updateLiveCards();
        renderLiveFocus();
      }
    });
  });
}

function renderTwinStateList(data) {
  refs.twinStateList.innerHTML = data.twinState
    .map(
      (row) => {
        const openKey = row.thing_id;

        return `
        <details class="accordion-card" style="--tone:${row.tone}" data-open-key="${openKey}"${isAccordionOpen("twinState", openKey) ? " open" : ""}>
          <summary class="accordion-summary">
            <span class="icon-shell accordion-icon">${iconSet[getSensorByEntityType(row.device_type).icon]}</span>
            <div class="accordion-copy">
              <p class="accordion-kicker">Latest Twin State</p>
              <h3 class="accordion-title">${row.device_type}</h3>
              <p class="accordion-preview">${row.thing_id}</p>
            </div>
            <span class="accordion-caret" aria-hidden="true">v</span>
            <div class="accordion-value">
              <span class="accordion-value-text">${row.latest_value}</span>
            </div>
          </summary>
          <div class="accordion-body">
            <div class="accordion-grid">
              <div class="accordion-field">
                <span>thing_id</span>
                <strong>${row.thing_id}</strong>
              </div>
              <div class="accordion-field">
                <span>device_id</span>
                <strong>${row.device_id}</strong>
              </div>
              <div class="accordion-field">
                <span>device_type</span>
                <strong>${row.device_type}</strong>
              </div>
              <div class="accordion-field">
                <span>feature_name</span>
                <strong>${row.feature_name}</strong>
              </div>
              <div class="accordion-field">
                <span>latest_value</span>
                <strong>${row.latest_value}</strong>
              </div>
              <div class="accordion-field">
                <span>saref_type</span>
                <strong>${row.saref_type}</strong>
              </div>
            </div>
          </div>
        </details>
      `;
      }
    )
    .join("");

  bindAccordionState(refs.twinStateList, "twinState");
}

function renderChartStack() {
  refs.chartStack.innerHTML = chartDefinitions
    .map((chart) => {
      const sensor = getSensor(chart.key);
      const isOpen = appState.openCharts.has(chart.key);

      return `
        <article class="chart-card${isOpen ? " is-open" : ""}" data-key="${chart.key}" style="--tone:${sensor.tone}">
          <button class="chart-toggle" type="button" aria-expanded="${isOpen}">
            <div class="chart-toggle-main">
              <p>${chart.subtitle}</p>
              <h3 class="chart-title">${chart.title}</h3>
            </div>
            <div class="chart-toggle-meta">
              <span class="chart-current" data-current="${chart.key}">${formatSensorValue(sensor, getCurrentValue(sensor))}</span>
              <span class="chart-caret">v</span>
            </div>
          </button>
          <div class="chart-panel">
            <div class="chart-panel-inner">
              <div class="chart-canvas-wrap">
                <canvas id="chart-${chart.key}"></canvas>
              </div>
              <div class="chart-labels">
                <span>08:00</span>
                <span>10:00</span>
                <span>12:00</span>
                <span>14:00</span>
                <span>16:00</span>
                <span>18:00</span>
              </div>
              <div class="chart-stat-row">
                ${buildChartStats(sensor)}
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  bindChartCards();
  drawOpenCharts();
}

function buildChartStats(sensor) {
  const peak = Math.max(...sensor.history);
  const low = Math.min(...sensor.history);
  const change = sensor.history[sensor.history.length - 1] - sensor.history[0];

  return `
    <div class="chart-stat">
      <span>Highest</span>
      <strong>${peak.toFixed(sensor.decimals)} ${sensor.unit}</strong>
    </div>
    <div class="chart-stat">
      <span>Lowest</span>
      <strong>${low.toFixed(sensor.decimals)} ${sensor.unit}</strong>
    </div>
    <div class="chart-stat">
      <span>Change</span>
      <strong>${change >= 0 ? "+" : ""}${change.toFixed(sensor.decimals)} ${sensor.unit}</strong>
    </div>
  `;
}

function bindChartCards() {
  Array.from(refs.chartStack.querySelectorAll(".chart-card")).forEach((card) => {
    const toggle = card.querySelector(".chart-toggle");
    const key = card.dataset.key;

    toggle.addEventListener("click", () => {
      const willOpen = !card.classList.contains("is-open");
      card.classList.toggle("is-open", willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));

      if (willOpen) {
        appState.openCharts.add(key);
      } else {
        appState.openCharts.delete(key);
      }

      if (willOpen) {
        requestAnimationFrame(() => animateChartDraw(key));
      }
    });
  });
}

function drawOpenCharts() {
  Array.from(refs.chartStack.querySelectorAll(".chart-card.is-open")).forEach((card) => {
    animateChartDraw(card.dataset.key);
  });
}

function animateChartDraw(key) {
  const sensor = getSensor(key);
  const canvas = document.getElementById(`chart-${key}`);

  if (!canvas) {
    return;
  }

  if (appState.chartAnimations.has(key)) {
    cancelAnimationFrame(appState.chartAnimations.get(key));
  }

  const start = performance.now();
  const duration = 700;

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    drawChart(canvas, sensor, eased);

    if (progress < 1) {
      const handle = requestAnimationFrame(step);
      appState.chartAnimations.set(key, handle);
    }
  }

  const handle = requestAnimationFrame(step);
  appState.chartAnimations.set(key, handle);
}

function drawChart(canvas, sensor, progress = 1) {
  const wrapper = canvas.parentElement;
  const width = wrapper.clientWidth;
  const height = wrapper.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const values = sensor.history;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = { top: 16, right: 10, bottom: 16, left: 8 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const visiblePoints = 1 + (values.length - 1) * progress;
  const lastFullIndex = Math.floor(visiblePoints - 1);
  const fraction = visiblePoints - 1 - lastFullIndex;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;

  for (let line = 0; line < 4; line += 1) {
    const y = padding.top + (plotHeight / 3) * line;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  function getPoint(index) {
    const x = padding.left + (plotWidth / (values.length - 1)) * index;
    const y = padding.top + plotHeight - ((values[index] - min) / range) * plotHeight;
    return { x, y };
  }

  ctx.beginPath();

  values.forEach((_, index) => {
    if (index > lastFullIndex + 1) {
      return;
    }

    let point = getPoint(index);

    if (index === lastFullIndex + 1 && index < values.length && fraction > 0) {
      const previous = getPoint(index - 1);
      point = {
        x: previous.x + (point.x - previous.x) * fraction,
        y: previous.y + (point.y - previous.y) * fraction
      };
    }

    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height);
  gradient.addColorStop(0, `${sensor.tone}66`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.lineWidth = 3;
  ctx.strokeStyle = sensor.tone;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  const areaPath = new Path2D();

  values.forEach((_, index) => {
    if (index > lastFullIndex + 1) {
      return;
    }

    let point = getPoint(index);

    if (index === lastFullIndex + 1 && index < values.length && fraction > 0) {
      const previous = getPoint(index - 1);
      point = {
        x: previous.x + (point.x - previous.x) * fraction,
        y: previous.y + (point.y - previous.y) * fraction
      };
    }

    if (index === 0) {
      areaPath.moveTo(point.x, point.y);
    } else {
      areaPath.lineTo(point.x, point.y);
    }
  });

  const finalX = padding.left + plotWidth * progress;
  areaPath.lineTo(finalX, padding.top + plotHeight);
  areaPath.lineTo(padding.left, padding.top + plotHeight);
  areaPath.closePath();

  ctx.fillStyle = gradient;
  ctx.fill(areaPath);

  values.forEach((_, index) => {
    if (index > lastFullIndex) {
      return;
    }

    const point = getPoint(index);
    ctx.beginPath();
    ctx.fillStyle = sensor.tone;
    ctx.arc(point.x, point.y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function getViewportMode() {
  if (window.innerWidth >= 1100) {
    return "desktop";
  }

  if (window.innerWidth >= 768) {
    return "tablet";
  }

  return "mobile";
}

function updateResponsiveUi() {
  const viewportMode = getViewportMode();
  document.body.dataset.viewport = viewportMode;

  if (!refs.swipeHint) {
    return;
  }

  if (viewportMode === "desktop") {
    refs.swipeHint.textContent = "Scroll or tap to compare devices";
    return;
  }

  if (viewportMode === "tablet") {
    refs.swipeHint.textContent = "Swipe or scroll to compare devices";
    return;
  }

  refs.swipeHint.textContent = "Swipe to compare devices";
}

function renderDataSummary(data) {
  const summaryTiles = [
    { label: "Structured records", value: `${data.ngsiRecords.length} shown` },
    { label: "Processed rows", value: `${data.processedRecords.length} recent rows` },
    { label: "Twin state rows", value: `${data.twinState.length} live rows` },
    { label: "Last updated", value: formatTime(appState.lastSync) }
  ];

  refs.dataSummary.innerHTML = summaryTiles
    .map(
      (tile) => `
        <div class="summary-tile">
          <span>${tile.label}</span>
          <strong>${tile.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderNgsiRecordList(data) {
  refs.ngsiRecordList.innerHTML = data.ngsiRecords
    .map((record) => {
      const sensor = getSensorByEntityType(record.entity_type);
      const openKey = `${record.ngsi_id}|${record.created_at}`;

      return `
        <details class="accordion-card" style="--tone:${sensor.tone}" data-open-key="${openKey}"${isAccordionOpen("ngsiRecords", openKey) ? " open" : ""}>
          <summary class="accordion-summary">
            <span class="icon-shell accordion-icon">${iconSet[sensor.icon]}</span>
            <div class="accordion-copy">
              <p class="accordion-kicker">Structured Device Record</p>
              <h3 class="accordion-title">${record.ngsi_type}</h3>
              <p class="accordion-preview">${record.ngsi_id}</p>
            </div>
            <span class="accordion-caret" aria-hidden="true">v</span>
            <div class="accordion-value">
              <span class="accordion-value-text">${record.display_value}</span>
            </div>
          </summary>
          <div class="accordion-body">
            <div class="accordion-grid">
              <div class="accordion-field"><span>ngsi_id</span><strong>${record.ngsi_id}</strong></div>
              <div class="accordion-field"><span>ngsi_type</span><strong>${record.ngsi_type}</strong></div>
              <div class="accordion-field"><span>ngsi_property</span><strong>${record.ngsi_property}</strong></div>
              <div class="accordion-field"><span>value_only</span><strong>${record.value_only}</strong></div>
              <div class="accordion-field"><span>unit</span><strong>${record.unit}</strong></div>
              <div class="accordion-field"><span>display_value</span><strong>${record.display_value}</strong></div>
              <div class="accordion-field"><span>entity_type</span><strong>${record.entity_type}</strong></div>
              <div class="accordion-field"><span>attribute_name</span><strong>${record.attribute_name}</strong></div>
              <div class="accordion-field"><span>saref_type</span><strong>${record.saref_type}</strong></div>
              <div class="accordion-field"><span>saref_unit</span><strong>${record.saref_unit}</strong></div>
              <div class="accordion-field"><span>created_at</span><strong>${record.created_at}</strong></div>
            </div>
          </div>
        </details>
      `;
    })
    .join("");

  bindAccordionState(refs.ngsiRecordList, "ngsiRecords");
}

function renderProcessedRecordList(data) {
  refs.processedRecordList.innerHTML = data.processedRecords
    .slice(0, 10)
    .map((record) => {
      const sensor = getSensorByEntityType(record.entity_type);
      const openKey = String(record.id);

      return `
        <details class="accordion-card" style="--tone:${sensor.tone}" data-open-key="${openKey}"${isAccordionOpen("processedRecords", openKey) ? " open" : ""}>
          <summary class="accordion-summary">
            <span class="icon-shell accordion-icon">${iconSet[sensor.icon]}</span>
            <div class="accordion-copy">
              <p class="accordion-kicker">Recent Processed Record</p>
              <h3 class="accordion-title">${record.entity_type}</h3>
              <p class="accordion-preview">${record.entity_id}</p>
            </div>
            <span class="accordion-caret" aria-hidden="true">v</span>
            <div class="accordion-value">
              <span class="accordion-value-text">${record.attribute_value}</span>
            </div>
          </summary>
          <div class="accordion-body">
            <div class="accordion-grid">
              <div class="accordion-field"><span>id</span><strong>${record.id}</strong></div>
              <div class="accordion-field"><span>entity_id</span><strong>${record.entity_id}</strong></div>
              <div class="accordion-field"><span>entity_type</span><strong>${record.entity_type}</strong></div>
              <div class="accordion-field"><span>attribute_name</span><strong>${record.attribute_name}</strong></div>
              <div class="accordion-field"><span>attribute_value</span><strong>${record.attribute_value}</strong></div>
              <div class="accordion-field"><span>saref_type</span><strong>${record.saref_type}</strong></div>
              <div class="accordion-field"><span>saref_unit</span><strong>${record.saref_unit}</strong></div>
              <div class="accordion-field"><span>ngsi_id</span><strong>${record.ngsi_id}</strong></div>
              <div class="accordion-field"><span>ngsi_type</span><strong>${record.ngsi_type}</strong></div>
              <div class="accordion-field"><span>ngsi_property</span><strong>${record.ngsi_property}</strong></div>
              <div class="accordion-field"><span>created_at</span><strong>${record.created_at}</strong></div>
            </div>
          </div>
        </details>
      `;
    })
    .join("");

  bindAccordionState(refs.processedRecordList, "processedRecords");
}

function renderRawJson(data) {
  refs.dittoJson.textContent = JSON.stringify(data.dittoRaw, null, 2);
  refs.ngsiJson.textContent = JSON.stringify(data.rawNgsiPayloads, null, 2);
}

function renderDashboardSections(initial = false) {
  const data = buildDashboardData();

  renderHeroMetrics(data);
  renderHomeKpis();
  renderLatestStatusList(data);
  renderActivityList();
  renderTwinStateList(data);
  renderDataSummary(data);
  renderNgsiRecordList(data);
  renderProcessedRecordList(data);
  renderRawJson(data);
  updateLiveCards(initial);
  renderLiveFocus();
  updateChartHeaderValues();
}

function updateChartHeaderValues() {
  chartDefinitions.forEach((chart) => {
    const sensor = getSensor(chart.key);
    const current = refs.chartStack.querySelector(`[data-current="${chart.key}"]`);

    if (current) {
      current.textContent = formatSensorValue(sensor, getCurrentValue(sensor));
    }
  });
}

function advanceFeed() {
  appState.tick += 1;
  appState.lastSync = new Date();
  renderDashboardSections();
}

function setupNavigation() {
  refs.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);

      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (!visibleSection) {
        return;
      }

      const currentId = visibleSection.target.dataset.nav;

      refs.navButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.target === currentId);
      });
    },
    {
      threshold: [0.35, 0.6]
    }
  );

  refs.sections.forEach((section) => sectionObserver.observe(section));
}

function setupRevealObserver() {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15
    }
  );

  document.querySelectorAll(".section-reveal").forEach((section) => {
    revealObserver.observe(section);
  });
}

function setupSplashScreen() {
  setTimeout(() => {
    document.body.classList.add("app-ready");
    refs.splashScreen.setAttribute("aria-hidden", "true");
  }, 1300);
}

function setupResizeHandler() {
  let timer = null;

  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateResponsiveUi();
      drawOpenCharts();
    }, 120);
  });
}

function initializeApp() {
  updateResponsiveUi();
  renderLiveCarousel();
  renderChartStack();
  renderDashboardSections(true);
  setupNavigation();
  setupRevealObserver();
  setupSplashScreen();
  setupResizeHandler();
  setInterval(advanceFeed, 5000);
}

initializeApp();
