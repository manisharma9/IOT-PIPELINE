# Dashboard Video Recording Guide

This guide explains how to create the local client-facing MP4 walkthrough for the Customer Operator Console.

The video is generated locally. It does not deploy to AWS, control real household devices, or claim official ENERSHARE or IEEE 2030.5 certification.

## 1. Start the Local Pipeline

From the repository root:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
```

Check service health:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
```

## 2. Start Ollama and Phi-3 Mini

Check that Ollama is reachable:

```powershell
Invoke-WebRequest -Uri http://localhost:11434/api/tags -UseBasicParsing
ollama list
```

If Phi-3 Mini is missing:

```powershell
ollama pull phi3:mini
```

## 3. Start the Dashboard

Open a new PowerShell window:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npm install
npm run dev
```

Dashboard URL:

```text
http://localhost:3000
```

The recording script uses the local demo login:

```text
operator / operator123
```

## 4. Record the MP4

Open another PowerShell window:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npm run record:demo
```

The generated MP4 is saved here:

```text
C:\Users\Mani\Desktop\Github\IOT-PIPELINE\docs\demo-assets\customer-dashboard-demo.mp4
```

## What the Video Shows

- Executive overview
- Live pipeline flow
- Device simulator insights
- Shelly Plug simulator
- Enode / Easee EV charger simulator
- Heat Pump simulator
- SLM / Phi-3 Mini primary mapping
- `mapping_source = slm_primary` where visible
- Deterministic fallback section
- Security gateway insights
- Kafka and TimescaleDB insights
- IEEE 2030.5-style translation
- Aggregator and dispatch workflow
- Dataspace export foundation
- Architecture view
- Safe demo mode actions

## Troubleshooting

### Dashboard is not reachable

The recorder expects the dashboard to be running at `http://localhost:3000`.

Start it:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npm run dev
```

To use a different dashboard URL:

```powershell
$env:DASHBOARD_URL="http://localhost:3005"
npm run record:demo
```

### Playwright cannot launch Chromium

Install the Playwright browser binary:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npx playwright install chromium
```

The script first tries the local Chrome channel and then falls back to Playwright Chromium.

### Playwright reports missing FFmpeg for video recording

Install Playwright's recording helper:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npx playwright install ffmpeg
```

### FFmpeg conversion fails

The project includes `ffmpeg-static` for repeatable WebM-to-MP4 conversion.

If local policy blocks the bundled binary, install FFmpeg manually:

```powershell
winget install Gyan.FFmpeg
```

Then rerun:

```powershell
npm run record:demo
```

### npm certificate error

If npm reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, retry with the Windows certificate store:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm install
```

### PowerShell script policy blocks startup scripts

Use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
```

## Stop Services

Stop the dashboard with `Ctrl+C`.

Stop the backend stack:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```
