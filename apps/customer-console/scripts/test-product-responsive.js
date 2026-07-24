"use strict";

const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const baseUrl = process.env.CUSTOMER_CONSOLE_URL || "http://127.0.0.1:3000";
const outputDirectory = path.resolve(__dirname, "../../../docs/demo-assets");
const appDirectory = path.resolve(__dirname, "..");
const useLiveData = process.env.PRODUCT_TEST_LIVE_DATA === "true";
let serverProcess = null;

function stopServer() {
  if (!serverProcess?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(serverProcess.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
}

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await reachable(`${baseUrl}/login`)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Customer console did not start at ${baseUrl}`);
}

async function startServerIfNeeded() {
  if (await reachable(`${baseUrl}/login`)) return;
  serverProcess = spawn(
    "cmd.exe",
    ["/d", "/s", "/c", "npm.cmd run start"],
    {
      cwd: appDirectory,
      env: {
        ...process.env,
        EDGE_API_KEY: process.env.EDGE_API_KEY || "local-dev-edge-key",
        DEMO_AUTH_USERNAME: process.env.DEMO_AUTH_USERNAME || "operator",
        DEMO_AUTH_PASSWORD: process.env.DEMO_AUTH_PASSWORD || "operator123",
        DEMO_AUTH_ROLE: "enershare_operator",
        DEMO_AUTH_COMMUNITY_ID: "community-dublin-north"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  serverProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer();
}

const now = new Date();
const iso = (minutesAgo = 0) => new Date(now.getTime() - minutesAgo * 60000).toISOString();
const analyticsPoints = Array.from({ length: 25 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const ev = index >= 16 && index <= 20 ? 2.8 : 0.2;
  const heat = 0.9 + Math.sin(angle) * 0.35;
  const plug = 0.25 + Math.cos(angle * 2) * 0.1;
  return {
    bucket_start: iso((24 - index) * 60),
    total_power_kw: Number((ev + heat + plug).toFixed(2)),
    smart_plug_power_kw: Number(plug.toFixed(2)),
    ev_charger_power_kw: Number(ev.toFixed(2)),
    heat_pump_power_kw: Number(heat.toFixed(2)),
    sample_count: 3
  };
});

const fixtureByPath = {
  "/api/customer/households": {
    role: "enershare_operator",
    community_id: "community-dublin-north",
    households: [{
      selector_id: "household_43c7b8e9a1",
      display_name: "household_43c7b8e9a1",
      pseudonym: "household_43c7b8e9a1",
      device_count: 3,
      selected_by_default: true
    }]
  },
  "/api/customer/summary": {
    household: {
      display_name: "household_43c7b8e9a1",
      pseudonym: "household_43c7b8e9a1",
      community_id: "community-dublin-north"
    },
    connection: { status: "live", last_updated: iso(1) },
    live_consumption_kw: 4.28,
    energy_used_today_kwh: 12.84,
    energy_used_today_quality: "partly_estimated",
    active_devices: 3,
    total_devices: 3,
    flexible_load_available_kw: 4.28,
    flexible_load_quality: "estimated",
    current_grid_event: {
      proposal_id: "42",
      requested_action: "reduce_load",
      proposed_action: "reduce_ev_charging",
      target_kw: 2.5,
      priority: "medium",
      status: "reviewed",
      display_status: "Reviewed",
      start_time: iso(-30),
      end_time: iso(-90),
      reason: "Community demand is approaching the local operating threshold."
    },
    simulated_energy_shifted_today_kwh: 1.25,
    shifted_energy_quality: "simulated_estimate",
    flexibility_score: {
      available: true,
      score: 83,
      reason: null,
      components: [
        { id: "controllable_load", label: "Controllable load", points: 28, maximum: 30 },
        { id: "device_availability", label: "Device availability", points: 25, maximum: 25 },
        { id: "ev_flexibility", label: "EV flexibility", points: 15, maximum: 15 },
        { id: "heat_pump_flexibility", label: "Heat-pump flexibility", points: 15, maximum: 15 },
        { id: "response_reliability", label: "Simulation reliability", points: 0, maximum: 15 }
      ]
    },
    simulation: {
      enabled: true,
      no_real_execution: true,
      notice: "Controlled demonstration using simulated energy devices. No real household device control is enabled."
    },
    unavailable_metrics: ["financial_savings", "carbon_reduction"]
  },
  "/api/customer/analytics": {
    range: {
      range: "24h",
      label: "Last 24 hours",
      start: iso(1440),
      end: iso(0),
      bucket: "15 minutes"
    },
    units: "kW",
    points: analyticsPoints,
    data_status: "available",
    data_quality: "measured_simulated_telemetry_downsampled",
    partial_data: false,
    flexibility_events: [{
      proposal_id: "42",
      start_time: iso(120),
      end_time: iso(60),
      target_kw: 2.5,
      status: "reviewed",
      display_status: "Reviewed"
    }]
  },
  "/api/customer/devices": {
    limit: 12,
    offset: 0,
    total: 3,
    simulation: true,
    no_real_execution: true,
    devices: [
      {
        device_id: "shelly-plug-001",
        device_type: "shelly_plug",
        display_name: "Shelly smart plug",
        simulated: true,
        online: true,
        last_seen: iso(1),
        current_power_kw: 0.38,
        energy_used_today_kwh: 1.9,
        energy_quality: "measured",
        operating_state: "On",
        indoor_temperature_c: null,
        target_temperature_c: null,
        voltage_v: 230.4,
        current_a: 1.65,
        flexibility_available: true,
        flexibility_available_kw: 0.38,
        latest_simulated_command: null,
        event_participation: false
      },
      {
        device_id: "easee-core-001",
        device_type: "ev_charger",
        display_name: "Easee EV charger",
        simulated: true,
        online: true,
        last_seen: iso(2),
        current_power_kw: 2.9,
        energy_used_today_kwh: 7.4,
        energy_quality: "measured",
        operating_state: "Charging",
        indoor_temperature_c: null,
        target_temperature_c: null,
        voltage_v: null,
        current_a: null,
        flexibility_available: true,
        flexibility_available_kw: 2.9,
        latest_simulated_command: {
          action: "reduce_charging_power",
          status: "accepted",
          time: iso(25),
          no_real_execution: true
        },
        event_participation: true
      },
      {
        device_id: "heat-pump-001",
        device_type: "heat_pump",
        display_name: "Heat pump",
        simulated: true,
        online: true,
        last_seen: iso(1),
        current_power_kw: 1,
        energy_used_today_kwh: 3.54,
        energy_quality: "estimated",
        operating_state: "Heating",
        indoor_temperature_c: 20.4,
        target_temperature_c: 21,
        voltage_v: null,
        current_a: null,
        flexibility_available: true,
        flexibility_available_kw: 1,
        latest_simulated_command: null,
        event_participation: false
      }
    ]
  },
  "/api/customer/flexibility": {
    latest_event: {
      proposal_id: "42",
      signal_id: "signal-42",
      requested_action: "reduce_load",
      proposed_action: "reduce_ev_charging",
      target_kw: 2.5,
      start_time: iso(-30),
      end_time: iso(-90),
      duration_minutes: 60,
      priority: "medium",
      status: "reviewed",
      display_status: "Reviewed",
      reason: "Community demand is approaching the local operating threshold.",
      suggested_device_contributions: [{
        device_id: "easee-core-001",
        device_type: "ev_charger",
        allocated_reduction_kw: 2.5,
        customer_action: "Simulation completed",
        no_real_execution: true
      }],
      mock_dispatch_status: "Simulation completed",
      simulated_shifted_energy_kwh: 2.5,
      shifted_energy_quality: "simulated_estimate",
      timeline: [
        { time: iso(40), status: "proposed", label: "Opportunity received" },
        { time: iso(30), status: "reviewed", label: "Reviewed" }
      ]
    },
    events: [],
    flexible_load_currently_available_kw: 2.5,
    no_real_execution: true,
    execution_mode: "simulation_only"
  },
  "/api/customer/community": {
    community_id: "community-dublin-north",
    selected_household: "household_43c7b8e9a1",
    household_count: 5,
    active_households: 5,
    total_community_demand_kw: 21.4,
    flexible_load_available_kw: 13.2,
    average_household_load_kw: 4.28,
    active_flexibility_events: 1,
    active_requested_reduction_kw: 2.5,
    device_type_distribution: [
      { device_type: "shelly_plug", count: 5 },
      { device_type: "ev_charger", count: 5 },
      { device_type: "heat_pump", count: 5 }
    ],
    comparison_available: true,
    selected_household_percentile: 60,
    privacy: {
      anonymized: true,
      household_identifiers_exposed: false,
      minimum_comparison_group: 5
    }
  },
  "/api/customer/reports": {
    period: "weekly",
    period_days: 7,
    generated_at: iso(0),
    energy: [{
      day: iso(1440),
      energy_used_kwh: 12.84,
      metered_energy_kwh: 9.3,
      estimated_energy_kwh: 3.54,
      data_quality: "partly_estimated"
    }],
    device_breakdown: [
      { device_id: "easee-core-001", device_type: "ev_charger", energy_used_kwh: 7.4, data_quality: "measured" },
      { device_id: "heat-pump-001", device_type: "heat_pump", energy_used_kwh: 3.54, data_quality: "estimated" },
      { device_id: "shelly-plug-001", device_type: "shelly_plug", energy_used_kwh: 1.9, data_quality: "measured" }
    ],
    flexibility_history: [],
    labels: {
      measured: "Measured from simulated meter telemetry",
      estimated: "Estimated from sampled simulated power",
      simulated: "Simulated workflow result"
    }
  },
  "/api/customer/insights": {
    status: "cached",
    insights: [{
      insight_id: "insight-1",
      category: "peak_period",
      title: "Peak energy period",
      text: "Household power peaked at 4.28 kW during the evening charging period.",
      supporting_metrics: { total_power_kw: 4.28 },
      period_start: iso(1440),
      period_end: iso(0),
      generated_at: iso(5),
      expires_at: iso(-55),
      confidence: 0.91,
      validation_status: "validated",
      label: "AI-powered energy insight"
    }]
  }
};
fixtureByPath["/api/customer/flexibility"].events = [
  fixtureByPath["/api/customer/flexibility"].latest_event
];

async function installFixtures(page, overrides = {}) {
  await page.route("**/api/customer/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data = Object.hasOwn(overrides, pathname)
      ? overrides[pathname]
      : fixtureByPath[pathname];
    if (!data) {
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "fixture_not_found" })
      });
    }
    if (data.__http_error) {
      return route.fulfill({
        status: data.status,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          status_code: data.status,
          correlation_id: "responsive-error-test",
          data: {
            error: data.error,
            message: data.message
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        status_code: 200,
        correlation_id: "responsive-test",
        data
      })
    });
  });
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Username").fill(
    process.env.DEMO_AUTH_USERNAME || "operator"
  );
  await page.getByLabel("Password").fill(
    process.env.DEMO_AUTH_PASSWORD || "operator123"
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

async function assertResponsive(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor();
  await page.waitForTimeout(300);
  const width = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  assert.ok(
    width.document <= width.viewport + 1,
    `${route} overflows: ${width.document}px in ${width.viewport}px`
  );
  const text = await page.locator("main").innerText();
  for (const token of ["Kafka", "Ollama", "TimescaleDB", "raw JSON"]) {
    assert.equal(text.includes(token), false, `${route} exposes ${token}`);
  }
  assert.ok(
    await page.locator("main h1").count(),
    `${route} has no primary heading`
  );
  const unnamedButtons = await page.locator("button").evaluateAll((buttons) => (
    buttons.filter((button) => !(
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      button.textContent?.trim()
    )).length
  ));
  assert.equal(unnamedButtons, 0, `${route} has unnamed buttons`);
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await startServerIfNeeded();
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1
    });
    const page = await desktop.newPage();
    if (!useLiveData) {
      await installFixtures(page);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    for (const route of [
      "/dashboard",
      "/dashboard/analytics",
      "/dashboard/devices",
      "/dashboard/flexibility",
      "/dashboard/community",
      "/dashboard/reports",
      "/dashboard/settings"
    ]) {
      await assertResponsive(page, route);
    }
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outputDirectory, "customer-dashboard-desktop.png"),
      fullPage: true
    });
    await desktop.close();

    if (!useLiveData) {
      const states = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1
      });
      const emptyPage = await states.newPage();
      await installFixtures(emptyPage, {
        "/api/customer/analytics": {
          ...fixtureByPath["/api/customer/analytics"],
          points: [],
          data_status: "empty",
          partial_data: false
        }
      });
      await login(emptyPage);
      await emptyPage.goto(`${baseUrl}/dashboard/analytics`, {
        waitUntil: "domcontentloaded"
      });
      await emptyPage.getByText("No energy history for this period").waitFor();
      await states.close();

      const errors = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1
      });
      const errorPage = await errors.newPage();
      await installFixtures(errorPage, {
        "/api/customer/summary": {
          __http_error: true,
          status: 503,
          error: "customer_read_model_unavailable",
          message: "Customer energy data is temporarily unavailable."
        }
      });
      await login(errorPage);
      await errorPage.goto(`${baseUrl}/dashboard`, {
        waitUntil: "domcontentloaded"
      });
      await errorPage.getByText("Energy information unavailable").waitFor();
      await errors.close();

      const operatorAccess = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1
      });
      const operatorPage = await operatorAccess.newPage();
      await installFixtures(operatorPage);
      await login(operatorPage);
      await operatorPage.goto(`${baseUrl}/admin/operations`, {
        waitUntil: "domcontentloaded"
      });
      await operatorPage.waitForURL("**/dashboard");
      await operatorAccess.close();

      const adminAccess = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1
      });
      const adminPage = await adminAccess.newPage();
      await adminPage.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
      await adminPage.getByLabel("Username").fill(
        process.env.DEMO_ADMIN_USERNAME || "admin"
      );
      await adminPage.getByLabel("Password").fill(
        process.env.DEMO_ADMIN_PASSWORD || "admin123"
      );
      await adminPage.getByRole("button", { name: "Sign in" }).click();
      await adminPage.waitForURL("**/dashboard");
      await adminPage.goto(`${baseUrl}/admin/operations`, {
        waitUntil: "domcontentloaded"
      });
      await adminPage.locator("main").waitFor();
      assert.equal(
        new URL(adminPage.url()).pathname,
        "/admin/operations",
        "technical_admin could not access internal operations"
      );
      await adminAccess.close();
    }

    for (const profile of [
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 320, height: 800 }
    ]) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: 1
      });
      const responsivePage = await context.newPage();
      if (!useLiveData) {
        await installFixtures(responsivePage);
      }
      await login(responsivePage);
      await assertResponsive(responsivePage, "/dashboard");
      await responsivePage.screenshot({
        path: path.join(outputDirectory, `customer-dashboard-${profile.name}.png`),
        fullPage: true
      });
      await context.close();
    }

    console.log(
      `Product responsive and accessibility smoke checks passed (${useLiveData ? "live data" : "deterministic fixtures"}).`
    );
    console.log(`Screenshots saved in ${outputDirectory}`);
  } finally {
    await browser.close();
    stopServer();
  }
}

main().catch((error) => {
  stopServer();
  console.error(error);
  process.exit(1);
});
