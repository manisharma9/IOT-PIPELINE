"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
const demoUsername = process.env.DEMO_USERNAME || process.env.DEMO_AUTH_USERNAME;
const demoPassword = process.env.DEMO_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
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
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await page.getByRole("heading", { name: /^Good /i }).waitFor();
    await page.getByText(
      "Controlled demonstration using simulated energy devices. No real household device control is enabled.",
      { exact: true }
    ).waitFor();

    await page.goto(`${dashboardUrl}/dashboard/community`, { waitUntil: "networkidle" });
    await page.getByRole("heading", {
      name: "An anonymized view of shared energy flexibility"
    }).waitFor();
    await page.getByText("Validated 1,000-asset local cohort", { exact: true }).waitFor();
    const communityText = await page.locator("main").innerText();
    if (!communityText.includes("100") || !communityText.includes("1,000")) {
      throw new Error("The exact 100-household/1,000-asset cohort is not visible.");
    }

    await page.goto(`${dashboardUrl}/dashboard/devices`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Household device inventory" }).waitFor();
    const pageSummary = page.getByText(/Showing 1-\d+ of \d+ devices/);
    await pageSummary.waitFor();
    const pageSummaryText = await pageSummary.innerText();
    const pageCounts = pageSummaryText.match(/Showing 1-(\d+) of (\d+) devices/);
    if (!pageCounts || Number(pageCounts[1]) > 12 || Number(pageCounts[2]) < 1) {
      throw new Error(`Invalid bounded device page: ${pageSummaryText}`);
    }

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(`${dashboardUrl}/dashboard/community`, { waitUntil: "networkidle" });
    await mobile.getByRole("heading", {
      name: "An anonymized view of shared energy flexibility"
    }).waitFor();
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
      dashboard_url: `${dashboardUrl}/dashboard`,
      households_visible: 100,
      assets_visible: 1000,
      rendered_device_count: Number(pageCounts[1]),
      selected_household_device_count: Number(pageCounts[2]),
      device_page_size_limit: 12,
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
