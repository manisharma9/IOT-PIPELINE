const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3000";
const demoUsername = process.env.DEMO_USERNAME || process.env.DEMO_AUTH_USERNAME;
const demoPassword = process.env.DEMO_PASSWORD || process.env.DEMO_AUTH_PASSWORD;
const outputDir = path.join(repoRoot, "docs", "demo-assets");
const outputMp4 = path.join(outputDir, "customer-dashboard-demo.mp4");
const tempDir = path.join(appRoot, ".demo-recordings");
const viewport = { width: 1440, height: 1000 };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function assertDashboardIsRunning() {
  if (!demoUsername || !demoPassword) {
    throw new Error("Set DEMO_USERNAME and DEMO_PASSWORD before recording the dashboard.");
  }
  try {
    const response = await fetch(`${dashboardUrl}/login`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Dashboard returned HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      [
        `Dashboard is not reachable at ${dashboardUrl}.`,
        "Start it first:",
        "  cd apps/customer-console",
        "  npm run dev",
        "",
        `Original error: ${error.message}`
      ].join("\n")
    );
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || "chrome",
      headless: true
    });
  } catch (channelError) {
    try {
      return await chromium.launch({ headless: true });
    } catch (defaultError) {
      throw new Error(
        [
          "Unable to launch Chromium for recording.",
          "Install Playwright browsers with:",
          "  npx playwright install chromium",
          "",
          `Chrome channel error: ${channelError.message}`,
          `Default Chromium error: ${defaultError.message}`
        ].join("\n")
      );
    }
  }
}

async function addCaption(page, title, subtitle = "") {
  await page.evaluate(
    ({ title: captionTitle, subtitle: captionSubtitle }) => {
      const existing = document.getElementById("recording-caption");
      if (existing) existing.remove();

      const caption = document.createElement("div");
      caption.id = "recording-caption";
      caption.style.position = "fixed";
      caption.style.right = "24px";
      caption.style.bottom = "24px";
      caption.style.zIndex = "9999";
      caption.style.maxWidth = "430px";
      caption.style.padding = "14px 16px";
      caption.style.border = "1px solid rgba(16, 185, 129, 0.35)";
      caption.style.background = "rgba(8, 12, 18, 0.88)";
      caption.style.boxShadow = "0 18px 60px rgba(0,0,0,0.35)";
      caption.style.backdropFilter = "blur(14px)";
      caption.style.borderRadius = "8px";
      caption.style.color = "white";
      caption.style.fontFamily = "Inter, ui-sans-serif, system-ui, sans-serif";
      caption.innerHTML = `
        <div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #6ee7b7;">Customer dashboard demo</div>
        <div style="margin-top: 4px; font-size: 16px; font-weight: 700;">${captionTitle}</div>
        ${captionSubtitle ? `<div style="margin-top: 6px; color: #cbd5e1; font-size: 12px; line-height: 1.45;">${captionSubtitle}</div>` : ""}
      `;
      document.body.appendChild(caption);
    },
    { title, subtitle }
  );
}

async function waitForReady(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function scrollTo(page, y, waitMs = 1800) {
  await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: "smooth" }), y);
  await page.waitForTimeout(waitMs);
}

async function gotoSection(page, route, title, subtitle, scrollStops = [0, 520, 1080]) {
  console.log(`Recording ${title}`);
  await page.goto(`${dashboardUrl}${route}`);
  await waitForReady(page);
  await addCaption(page, title, subtitle);
  for (const stop of scrollStops) {
    await scrollTo(page, stop);
  }
}

async function login(page) {
  await page.goto(`${dashboardUrl}/login`);
  await waitForReady(page);
  await addCaption(page, "Local operator login", "Demo authentication uses a server-side session cookie. Gateway credentials are not exposed to the browser.");
  await page.locator("input").nth(0).fill(demoUsername);
  await page.locator("input").nth(1).fill(demoPassword);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/overview", { timeout: 15000 });
  await waitForReady(page);
}

async function recordOverview(page) {
  await gotoSection(
    page,
    "/overview",
    "Executive overview",
    "Live status for the security gateway, Kafka, TimescaleDB, SLM-primary mapping, simulators, dispatch, and dataspace export.",
    [0, 470, 880]
  );

  await addCaption(page, "Live pipeline flow", "Devices move through the gateway, ingestion, Kafka digital spine, semantic intelligence, storage, DSO workflow, and dataspace export.");
  await scrollTo(page, 1150, 2500);

  await addCaption(page, "Device simulator insights", "Shelly Plug, Enode/Easee EV charger, Heat Pump, and unknown valid telemetry are visible with latest semantic/storage state.");
  await scrollTo(page, 1700, 2600);

  await addCaption(page, "SLM / Phi-3 Mini primary mapping", "Phi-3 Mini is shown as the primary semantic mapper. Deterministic SAREF4ENER mapping remains validation and fallback.");
  await scrollTo(page, 2150, 2800);

  await addCaption(page, "Security, Kafka, and TimescaleDB", "Security audit counts, Kafka topics, and TimescaleDB row counts are surfaced as operational evidence.");
  await scrollTo(page, 2750, 2600);

  await addCaption(page, "Aggregator, dispatch, and dataspace", "Load-management proposals, safe mock dispatch, simulated device translation, and minimized export are shown without real device control.");
  await scrollTo(page, 3400, 2600);

  await addCaption(page, "Demo mode actions", "Safe read-only actions show SLM-primary evidence, fallback information, blocked security payloads, and dataspace export samples.");
  await page.getByRole("button", { name: /show slm-primary result/i }).click().catch(() => {});
  await page.getByRole("button", { name: /show blocked security payload/i }).click().catch(() => {});
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: /show dataspace export sample/i }).click().catch(() => {});
  await page.waitForTimeout(3000);
}

async function convertToMp4(webmPath) {
  const ffmpegStatic = require("ffmpeg-static");
  const ffmpegPath = ffmpegStatic || "ffmpeg";

  if (fs.existsSync(outputMp4)) {
    fs.rmSync(outputMp4, { force: true });
  }

  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      webmPath,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputMp4
    ];
    const ffmpeg = spawn(ffmpegPath, args, { stdio: "inherit" });
    ffmpeg.on("error", (error) => {
      reject(
        new Error(
          [
            "FFmpeg failed to start.",
            "The project uses ffmpeg-static, but you can also install FFmpeg manually:",
            "  winget install Gyan.FFmpeg",
            "",
            error.message
          ].join("\n")
        )
      );
    });
    ffmpeg.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}.`));
    });
  });

  const stats = fs.statSync(outputMp4);
  if (stats.size <= 0) {
    throw new Error(`MP4 was created but is empty: ${outputMp4}`);
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  await assertDashboardIsRunning();
  const browser = await launchBrowser();
  let videoPath;

  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: {
        dir: tempDir,
        size: viewport
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    await login(page);
    await recordOverview(page);

    await gotoSection(page, "/security", "Security gateway", "API key validation, rate limiting, DPI-style inspection, correlation IDs, and audit records.", [0, 460, 980]);
    await page.getByRole("button", { name: /send safe blocked test payload/i }).click().catch(() => {});
    await page.waitForTimeout(2600);

    await gotoSection(page, "/semantic", "Semantic mapping", "SLM-primary interpretation is presented with deterministic SAREF4ENER validation and fallback only.", [0, 520, 980]);
    await gotoSection(page, "/ieee20305", "IEEE 2030.5-style translation", "MirrorMeterReading, DERStatus, and DSO-facing gateway concepts are shown as protocol-style outputs.", [0, 520, 980]);
    await gotoSection(page, "/dso", "DSO load-management request", "A DSO request can create grid signals and dispatch proposal flow without real device execution.", [0, 560, 1120]);
    await gotoSection(page, "/dispatch", "Aggregator and approval workflow", "Dispatch proposals move through review, approval, and ready-to-dispatch preparation.", [0, 520, 1100]);
    await gotoSection(page, "/mock-dispatch", "Safe mock dispatch", "Mock sent and mock result events keep no_real_execution=true and execution_mode=mock.", [0, 520, 1000]);
    await gotoSection(page, "/device-command", "Device API translation", "Approved commands translate into simulated Shelly Plug and Enode/Easee API language.", [0, 540, 1080]);
    await gotoSection(page, "/dataspace", "Dataspace export foundation", "Minimized and pseudonymized export views support future IDS/ENERSHARE-style integration.", [0, 540, 1120]);
    await page.getByRole("button", { name: /load catalog/i }).click().catch(() => {});
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: /run export summary/i }).click().catch(() => {});
    await page.waitForTimeout(2600);
    await gotoSection(page, "/architecture", "Layered architecture view", "Devices, security, ingestion, Kafka digital spine, SLM semantic intelligence, storage, DSO services, flexibility, dataspace, and dashboard.", [0, 600, 1200, 1750]);
    await gotoSection(page, "/aws-readiness", "AWS readiness view", "Prepared deployment mappings are shown without claiming a real cloud deployment.", [0, 520, 940]);

    await addCaption(page, "Client demo complete", "The platform remains local, simulated, and safe: no real household device control and no official certification claims.");
    await page.waitForTimeout(3500);

    const video = page.video();
    await context.close();
    videoPath = await video.path();
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("ffmpeg")) {
      throw new Error(
        [
          "Playwright could not start video recording because its FFmpeg helper is missing.",
          "Install it with:",
          "  npx playwright install ffmpeg",
          "",
          error.message
        ].join("\n")
      );
    }
    throw error;
  } finally {
    await browser.close();
  }

  console.log(`Recorded WebM: ${videoPath}`);
  await convertToMp4(videoPath);
  console.log(`MP4 created: ${outputMp4}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
