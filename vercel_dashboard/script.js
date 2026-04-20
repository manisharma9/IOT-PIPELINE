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
    type: "number",
    unit: "C",
    decimals: 2,
    category: "Comfort",
    status: "Stable",
    sequence: [27.94, 28.08, 27.88, 28.12, 27.99],
    history: [25.8, 26.2, 26.9, 27.3, 27.7, 27.94],
    summary: "Rooms are slightly warm but still within a comfortable occupied-home range.",
    insight: "Comfort looks steady",
    changeLabel: "Warm side of normal",
    decisionHint: "Supports heating and cooling decisions.",
    recordId: "TEMP-001",
    recordType: "Comfort reading",
    tone: "#7fd5ff"
  },
  {
    key: "humidity",
    label: "Humidity Sensor",
    icon: "humidity",
    type: "number",
    unit: "%",
    decimals: 1,
    category: "Comfort",
    status: "Stable",
    sequence: [59.3, 58.9, 59.7, 59.1, 59.4],
    history: [62.0, 61.4, 60.8, 60.1, 59.6, 59.3],
    summary: "Humidity is balanced, helping the space feel comfortable and well-managed.",
    insight: "Moisture looks balanced",
    changeLabel: "Within a healthy band",
    decisionHint: "Useful for comfort and ventilation decisions.",
    recordId: "HUM-002",
    recordType: "Air moisture record",
    tone: "#7ce8d0"
  },
  {
    key: "meter",
    label: "Smart Meter",
    icon: "meter",
    type: "number",
    unit: "kWh",
    decimals: 2,
    category: "Energy",
    status: "Active",
    sequence: [984.65, 986.11, 987.52, 988.44, 989.26],
    history: [954.2, 962.7, 970.1, 976.8, 981.4, 984.65],
    summary: "Energy use is rising through the day in a way that looks normal for an occupied home.",
    insight: "Usage is building normally",
    changeLabel: "Demand is increasing",
    decisionHint: "Helps track consumption and efficiency.",
    recordId: "MTR-003",
    recordType: "Energy use record",
    tone: "#ffbf74"
  },
  {
    key: "door",
    label: "Door Sensor",
    icon: "door",
    type: "state",
    unit: "state",
    category: "Access",
    status: "Secure",
    sequence: ["Closed", "Closed", "Open", "Closed", "Closed"],
    history: [0, 0, 1, 0, 0, 0],
    summary: "The main entry is currently closed, so the home appears secure right now.",
    insight: "Entry looks secure",
    changeLabel: "No open access now",
    decisionHint: "Useful for safety and access monitoring.",
    recordId: "DR-010",
    recordType: "Entry status record",
    tone: "#8ea6ff"
  },
  {
    key: "motion",
    label: "Motion Sensor",
    icon: "motion",
    type: "state",
    unit: "state",
    category: "Activity",
    status: "Active",
    sequence: [
      "Motion Detected",
      "No Motion",
      "Motion Detected",
      "Motion Detected",
      "No Motion"
    ],
    history: [0, 1, 0, 1, 1, 0],
    summary: "Motion has been detected recently, showing live occupancy activity in the home.",
    insight: "Occupancy is being tracked",
    changeLabel: "Movement seen recently",
    decisionHint: "Helps explain whether spaces are active or quiet.",
    recordId: "MOT-011",
    recordType: "Activity record",
    tone: "#ff8d9a"
  },
  {
    key: "co2",
    label: "CO2 Sensor",
    icon: "co2",
    type: "number",
    unit: "ppm",
    decimals: 2,
    category: "Air Quality",
    status: "Watch",
    sequence: [653.02, 640.18, 631.44, 647.3, 658.9],
    history: [580.0, 601.5, 614.9, 628.1, 640.5, 653.02],
    summary: "CO2 is visible at a level worth watching, which is helpful for ventilation decisions.",
    insight: "Air quality is easy to follow",
    changeLabel: "Slightly elevated indoor air",
    decisionHint: "Useful for ventilation and comfort decisions.",
    recordId: "CO2-006",
    recordType: "Air quality record",
    tone: "#66c5ff"
  },
  {
    key: "pressure",
    label: "Pressure Sensor",
    icon: "pressure",
    type: "number",
    unit: "hPa",
    decimals: 2,
    category: "Environment",
    status: "Stable",
    sequence: [1006.08, 1005.42, 1006.44, 1005.78, 1006.19],
    history: [1001.8, 1002.6, 1003.4, 1004.7, 1005.5, 1006.08],
    summary: "Pressure is steady, giving useful background context for the wider home environment.",
    insight: "Background conditions are stable",
    changeLabel: "Little change in pressure",
    decisionHint: "Adds context to other home readings.",
    recordId: "PRS-007",
    recordType: "Environmental record",
    tone: "#8db9ff"
  },
  {
    key: "light",
    label: "Light Sensor",
    icon: "light",
    type: "number",
    unit: "lux",
    decimals: 2,
    category: "Lighting",
    status: "Stable",
    sequence: [398.88, 405.24, 392.18, 401.14, 398.62],
    history: [340.0, 355.6, 371.2, 384.1, 392.4, 398.88],
    summary: "The room remains well lit, which helps explain comfort and present activity levels.",
    insight: "Lighting looks consistent",
    changeLabel: "Brightness is steady",
    decisionHint: "Useful for occupancy and ambience checks.",
    recordId: "LGT-008",
    recordType: "Lighting record",
    tone: "#ffd36b"
  },
  {
    key: "battery",
    label: "Battery Sensor",
    icon: "battery",
    type: "number",
    unit: "%",
    decimals: 2,
    category: "Device Health",
    status: "Good",
    sequence: [85.79, 85.42, 85.11, 84.96, 84.71],
    history: [91.4, 89.8, 88.9, 87.5, 86.3, 85.79],
    summary: "Battery level remains healthy, suggesting the monitoring network is ready for continued use.",
    insight: "Device health looks good",
    changeLabel: "Strong remaining charge",
    decisionHint: "Supports maintenance planning.",
    recordId: "BAT-009",
    recordType: "Device health record",
    tone: "#7df0a7"
  },
  {
    key: "water",
    label: "Water Flow Sensor",
    icon: "water",
    type: "number",
    unit: "L/min",
    decimals: 2,
    category: "Utilities",
    status: "Normal",
    sequence: [19.31, 18.82, 19.66, 19.14, 19.48],
    history: [15.8, 16.7, 17.4, 18.5, 18.9, 19.31],
    summary: "Water flow is steady, giving a simple view of current household usage.",
    insight: "Water use is easy to track",
    changeLabel: "No unusual surge seen",
    decisionHint: "Helps spot abnormal utility usage.",
    recordId: "WTR-012",
    recordType: "Usage record",
    tone: "#7ce8ff"
  }
];

const chartDefinitions = [
  { key: "temperature", title: "Temperature trend", subtitle: "Comfort through the day" },
  { key: "humidity", title: "Humidity trend", subtitle: "Moisture balance over time" },
  { key: "meter", title: "Smart meter trend", subtitle: "Energy use pattern" },
  { key: "co2", title: "CO2 trend", subtitle: "Air quality movement" }
];

const storyHighlights = [
  {
    title: "Current comfort",
    description: "Temperature, humidity, and air quality help show whether the home feels balanced and healthy right now.",
    tags: ["Comfort", "Air quality"]
  },
  {
    title: "Access and activity",
    description: "Door and motion readings make it clear whether the home is secure and whether activity is being detected.",
    tags: ["Entry", "Movement"]
  },
  {
    title: "Energy and utility use",
    description: "Meter and water readings show how household usage is moving and where efficiency conversations can begin.",
    tags: ["Energy", "Utilities"]
  },
  {
    title: "Monitoring reliability",
    description: "Battery and supporting sensor signals help confirm the system is healthy enough for ongoing monitoring.",
    tags: ["Device health", "Confidence"]
  }
];

const appState = {
  tick: 0,
  activeSensorIndex: 0,
  lastSync: new Date(),
  chartAnimations: new Map()
};

const refs = {
  heroMetrics: document.getElementById("heroMetrics"),
  storyHighlights: document.getElementById("storyHighlights"),
  latestInsightList: document.getElementById("latestInsightList"),
  liveCarousel: document.getElementById("liveCarousel"),
  carouselDots: document.getElementById("carouselDots"),
  liveFocus: document.getElementById("liveFocus"),
  chartStack: document.getElementById("chartStack"),
  dataSummary: document.getElementById("dataSummary"),
  recordList: document.getElementById("recordList"),
  qrArt: document.getElementById("qrArt"),
  splashScreen: document.getElementById("splashScreen"),
  navButtons: Array.from(document.querySelectorAll(".nav-item")),
  sections: Array.from(document.querySelectorAll(".screen-section"))
};

function findSensor(key) {
  return sensors.find((sensor) => sensor.key === key);
}

function getCurrentValue(sensor) {
  return sensor.sequence[appState.tick % sensor.sequence.length];
}

function formatValue(sensor, rawValue) {
  if (sensor.type === "state") {
    return rawValue;
  }

  return `${rawValue.toFixed(sensor.decimals)} ${sensor.unit}`;
}

function getNumericBounds(sensor) {
  const values = sensor.type === "state" ? [0, 1] : [...sensor.sequence, ...sensor.history];
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function getProgress(sensor, rawValue) {
  if (sensor.type === "state") {
    if (sensor.key === "door") {
      return rawValue === "Closed" ? 82 : 38;
    }

    return rawValue === "Motion Detected" ? 74 : 32;
  }

  const { min, max } = getNumericBounds(sensor);
  const normalized = ((rawValue - min) / (max - min || 1)) * 100;
  return Math.max(18, Math.min(96, normalized));
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatTimestamp(offsetMinutes) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(appState.lastSync.getTime() - offsetMinutes * 60000));
}

function renderHeroMetrics() {
  const doorValue = getCurrentValue(findSensor("door"));
  const homeStatus = doorValue === "Closed" ? "Secure and monitored" : "Entry needs attention";
  const meterSensor = findSensor("meter");

  const summaryTiles = [
    { label: "Sensors online", value: `${sensors.length} live readings` },
    { label: "Home status", value: homeStatus },
    { label: "Energy reading", value: formatValue(meterSensor, getCurrentValue(meterSensor)) },
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

function renderStoryHighlights() {
  refs.storyHighlights.innerHTML = storyHighlights
    .map(
      (step, index) => `
        <article class="flow-step">
          <div class="flow-step-top">
            <span class="flow-index">${index + 1}</span>
            <h3 class="flow-title">${step.title}</h3>
          </div>
          <p>${step.description}</p>
          <div class="flow-tags">
            ${step.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderLatestInsights() {
  const highlightKeys = ["temperature", "meter", "door", "co2", "water", "battery"];

  refs.latestInsightList.innerHTML = highlightKeys
    .map((key) => {
      const sensor = findSensor(key);
      const rawValue = getCurrentValue(sensor);

      return `
        <article class="insight-card" style="--tone:${sensor.tone}">
          <div class="insight-top">
            <div class="insight-title">
              <span class="icon-shell">${iconSet[sensor.icon]}</span>
              <div>
                <h3>${sensor.label}</h3>
                <p>${sensor.category}</p>
              </div>
            </div>
            <span class="status-pill">${sensor.status}</span>
          </div>
          <div class="insight-value">${formatValue(sensor, rawValue)}</div>
          <div class="insight-meta">${sensor.summary}</div>
        </article>
      `;
    })
    .join("");
}

function createLiveCard(sensor, index) {
  const rawValue = getCurrentValue(sensor);
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
          data-value="${isState ? rawValue : rawValue.toFixed(sensor.decimals)}"
        >
          ${isState ? rawValue : "0"}
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
    const rawValue = getCurrentValue(sensor);
    const valueEl = card.querySelector('[data-role="value"]');
    const fillEl = card.querySelector('[data-role="fill"]');

    if (sensor.type === "state") {
      swapStateText(valueEl, rawValue);
    } else {
      animateNumber(valueEl, rawValue, sensor.decimals, initial);
    }

    fillEl.style.width = `${getProgress(sensor, rawValue)}%`;
    card.classList.toggle("is-active", index === appState.activeSensorIndex);
  });

  updateCarouselDots();
}

function updateCarouselDots() {
  Array.from(refs.carouselDots.children).forEach((dot, index) => {
    dot.classList.toggle("is-active", index === appState.activeSensorIndex);
  });
}

function renderLiveFocus() {
  const sensor = sensors[appState.activeSensorIndex];
  const rawValue = getCurrentValue(sensor);

  refs.liveFocus.style.setProperty("--tone", sensor.tone);
  refs.liveFocus.innerHTML = `
    <div class="focus-top">
      <div>
        <p class="eyebrow">What it means</p>
        <h3>${sensor.label}</h3>
      </div>
      <span class="focus-chip">${sensor.status}</span>
    </div>
    <div class="focus-value">${formatValue(sensor, rawValue)}</div>
    <p class="focus-copy">${sensor.summary}</p>
    <div class="focus-grid">
      <div class="focus-detail">
        <span>Category</span>
        <strong>${sensor.category}</strong>
      </div>
      <div class="focus-detail">
        <span>Why it matters</span>
        <strong>${sensor.decisionHint}</strong>
      </div>
      <div class="focus-detail">
        <span>Recent signal</span>
        <strong>${sensor.changeLabel}</strong>
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

function renderChartStack() {
  refs.chartStack.innerHTML = chartDefinitions
    .map((chart, index) => {
      const sensor = findSensor(chart.key);
      return `
        <article class="chart-card${index === 0 ? " is-open" : ""}" data-key="${chart.key}" style="--tone:${sensor.tone}">
          <button class="chart-toggle" type="button" aria-expanded="${index === 0}">
            <div class="chart-toggle-main">
              <p>${chart.subtitle}</p>
              <h3 class="chart-title">${chart.title}</h3>
            </div>
            <div class="chart-toggle-meta">
              <span class="chart-current" data-current="${chart.key}">${formatValue(sensor, getCurrentValue(sensor))}</span>
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
  const values = sensor.history;
  const peak = Math.max(...values);
  const low = Math.min(...values);
  const change = values[values.length - 1] - values[0];
  const changeText = `${change >= 0 ? "+" : ""}${change.toFixed(sensor.decimals)} ${sensor.unit}`;

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
      <strong>${changeText}</strong>
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
  const sensor = findSensor(key);
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

function renderDataSummary() {
  const stableStatuses = new Set(["Stable", "Secure", "Good", "Normal"]);
  const stableCount = sensors.filter((sensor) => stableStatuses.has(sensor.status)).length;
  const doorValue = getCurrentValue(findSensor("door"));
  const motionValue = getCurrentValue(findSensor("motion"));

  const summaryTiles = [
    { label: "Latest records", value: "6 key devices" },
    { label: "Steady now", value: `${stableCount} readings in range` },
    {
      label: "Home activity",
      value: doorValue === "Closed" ? (motionValue === "Motion Detected" ? "Secure, movement seen" : "Secure and quiet") : "Entry open now"
    },
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

function renderRecordCards() {
  const recordKeys = ["temperature", "humidity", "meter", "door", "co2", "water"];

  refs.recordList.innerHTML = recordKeys
    .map((key, index) => {
      const sensor = findSensor(key);
      const rawValue = getCurrentValue(sensor);

      return `
        <article class="record-card" style="--tone:${sensor.tone}">
          <div class="record-top">
            <h3 class="record-heading">${sensor.label}</h3>
            <span class="status-pill">${sensor.status}</span>
          </div>
          <p class="record-id">${sensor.recordType} | ${sensor.recordId}</p>
          <div class="record-grid">
            <div class="record-cell">
              <span>Current reading</span>
              <strong>${formatValue(sensor, rawValue)}</strong>
            </div>
            <div class="record-cell">
              <span>Category</span>
              <strong>${sensor.category}</strong>
            </div>
            <div class="record-cell">
              <span>Why it matters</span>
              <strong>${sensor.decisionHint}</strong>
            </div>
            <div class="record-cell">
              <span>Updated</span>
              <strong>${formatTimestamp(index + 1)}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderQrArt() {
  const activeCells = new Set([
    0, 1, 2, 4, 6, 7, 8,
    9, 12, 14, 15, 17,
    18, 20, 22, 24, 26,
    28, 29, 30, 32, 34, 35,
    36, 38, 40, 42, 44,
    45, 47, 48, 50, 51, 53,
    54, 56, 58, 60, 62,
    63, 65, 66, 68, 69, 71,
    72, 73, 74, 76, 78, 79, 80
  ]);

  refs.qrArt.innerHTML = Array.from({ length: 81 }, (_, index) => {
    return `<span class="qr-pixel${activeCells.has(index) ? " is-on" : ""}"></span>`;
  }).join("");
}

function refreshDynamicSections(initial = false) {
  renderHeroMetrics();
  renderLatestInsights();
  renderDataSummary();
  renderRecordCards();
  updateLiveCards(initial);
  renderLiveFocus();
  updateChartHeaderValues();
}

function updateChartHeaderValues() {
  chartDefinitions.forEach((chart) => {
    const sensor = findSensor(chart.key);
    const current = refs.chartStack.querySelector(`[data-current="${chart.key}"]`);

    if (current) {
      current.textContent = formatValue(sensor, getCurrentValue(sensor));
    }
  });
}

function advanceFeed() {
  appState.tick += 1;
  appState.lastSync = new Date();
  refreshDynamicSections();
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
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

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
      drawOpenCharts();
    }, 120);
  });
}

function initializeApp() {
  renderStoryHighlights();
  renderLiveCarousel();
  renderChartStack();
  renderQrArt();
  refreshDynamicSections(true);
  setupNavigation();
  setupRevealObserver();
  setupSplashScreen();
  setupResizeHandler();
  setInterval(advanceFeed, 5000);
}

initializeApp();
