"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
const demoUsername = process.env.DEMO_USERNAME || process.env.DEMO_AUTH_USERNAME;
const demoPassword = process.env.DEMO_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
const evidencePath = path.join(
  repoRoot,
  "docs",
  "demo-assets",
  "multi-household-validation-results.json"
);
const screenshotPath = path.join(
  repoRoot,
  "docs",
  "demo-assets",
  "multi-household-dashboard.png"
);

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function main() {
  if (!demoUsername || !demoPassword) {
    throw new Error("Set DEMO_USERNAME and DEMO_PASSWORD before running the dashboard smoke test.");
  }
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = `${message.text()} ${message.location().url || ""}`.trim();
    if (/Failed to load resource.*404/i.test(entry)) {
      consoleWarnings.push(entry);
      return;
    }
    consoleErrors.push(entry);
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${dashboardUrl}/login`, { waitUntil: "networkidle" });
    await page.locator("input").nth(0).fill(demoUsername);
    await page.locator("input").nth(1).fill(demoPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/overview", { timeout: 15000 });
    await page.getByRole("heading", { name: /Live Smart Grid Communication Pipeline/i }).waitFor();
    await page.getByText("Phi-3 Mini active", { exact: true }).waitFor({ timeout: 20000 });

    const bodyText = await page.locator("body").innerText();
    const visibleRunDevices = bodyText.split(evidence.run_id).length - 1;
    if (visibleRunDevices < evidence.configuration.devices) {
      throw new Error(
        `Expected at least ${evidence.configuration.devices} visible ${evidence.run_id} device references, found ${visibleRunDevices}.`
      );
    }
    if (!bodyText.includes("No real device control")) {
      throw new Error("Dashboard safety boundary is not visible.");
    }

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${dashboardUrl}/overview`, { waitUntil: "networkidle" });
    await mobile.getByRole("heading", { name: /Live Smart Grid Communication Pipeline/i }).waitFor();
    const mobileLayout = await mobile.evaluate(() => ({
      viewport_width: window.innerWidth,
      content_width: document.documentElement.scrollWidth,
      document_height: document.documentElement.scrollHeight
    }));
    await mobile.close();

    if (consoleErrors.length) {
      throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
    }

    console.log(JSON.stringify({
      dashboard_url: `${dashboardUrl}/overview`,
      run_id: evidence.run_id,
      visible_run_device_references: visibleRunDevices,
      expected_devices: evidence.configuration.devices,
      phi3_primary_visible: true,
      safety_badge_visible: true,
      desktop_screenshot: screenshotPath,
      mobile_layout: mobileLayout,
      console_errors: 0,
      console_warnings: consoleWarnings
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
