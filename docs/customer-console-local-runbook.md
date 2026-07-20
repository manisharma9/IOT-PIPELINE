# Customer Console Local Runbook

This runbook explains how to run the Smart Grid Communication Console against the local Docker Compose platform. The console is a local development dashboard for the production-style pipeline. It does not deploy to AWS, control real devices, or claim certified ENERSHARE or IEEE 2030.5 compliance.

## Prerequisites

- Windows with PowerShell
- Docker Desktop running
- Node.js and npm available in PowerShell
- Ollama installed locally
- Phi-3 Mini available in Ollama
- Repository checked out at:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

## Environment Files

Create the backend `.env` file if it does not exist:

```powershell
Copy-Item .env.example .env
```

Create the Customer Console local environment file:

```powershell
Copy-Item apps\customer-console\.env.example apps\customer-console\.env.local
```

Expected console values for local demo:

```text
NEXT_PUBLIC_APP_NAME=Smart Grid Communication Console
GATEWAY_BASE_URL=http://localhost:3010
EDGE_API_KEY=local-dev-edge-key
DEMO_AUTH_USERNAME=operator
DEMO_AUTH_PASSWORD=operator123
NEXT_PUBLIC_DEPLOYMENT_MODE=local
```

`EDGE_API_KEY` is server-side only. It must not be exposed to browser code.

## Start Docker Stack

Start all backend services:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
```

Check service health:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
```

Check Docker Compose configuration:

```powershell
docker compose config
docker compose config --services
```

## Run Ollama and Phi-3 Mini

Check Ollama:

```powershell
ollama --version
ollama list
```

If Phi-3 Mini is missing:

```powershell
ollama pull phi3:mini
```

Start or verify the model:

```powershell
ollama run phi3:mini
```

In another PowerShell window, confirm Ollama tags:

```powershell
Invoke-WebRequest -Uri http://localhost:11434/api/tags -UseBasicParsing
```

Run the dedicated SLM-primary pipeline check:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-slm-primary.ps1
```

## Start Dashboard

Install dashboard dependencies once:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE\apps\customer-console
npm install
```

Start the dashboard:

```powershell
npm run dev
```

Dashboard URL:

```text
http://localhost:3000
```

Login:

```text
Username: operator
Password: operator123
```

## Run Full Demo

From the repository root:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
```

Then open:

```text
http://localhost:3000/overview
```

Use the dashboard buttons to:

- Refresh latest records
- Show SLM-primary result
- Show fallback example
- Show blocked security payload example
- Show dataspace export sample

## What the Dashboard Shows

- Executive pipeline status
- Service health
- Total telemetry processed
- Active simulators
- SLM primary status
- Kafka status and topics
- TimescaleDB storage counts
- Security gateway audit insights
- Device simulator insights
- DSO proposal and approval workflow status
- Mock dispatch results
- Device command translator output
- Dataspace export foundation status
- Professional layered architecture panel

## Troubleshooting

### npm not found

Install Node.js LTS and reopen PowerShell:

```powershell
node --version
npm --version
```

If the commands still fail, check that Node.js is on the Windows `PATH`.

### PowerShell execution policy

Use the bypass flag for local scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
```

### Docker not running

Start Docker Desktop, wait for it to finish initializing, then run:

```powershell
docker ps
docker compose config
```

### Ollama unavailable

Check:

```powershell
Invoke-WebRequest -Uri http://localhost:11434/api/tags -UseBasicParsing
ollama list
```

If Ollama is not reachable, start Ollama from the Windows application or run:

```powershell
ollama serve
```

Then ensure Phi-3 Mini exists:

```powershell
ollama pull phi3:mini
```

### Dashboard cannot reach backend

Confirm the backend stack:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
```

Confirm `apps/customer-console\.env.local` contains:

```text
GATEWAY_BASE_URL=http://localhost:3010
EDGE_API_KEY=local-dev-edge-key
```

### Port already in use

Check port `3000`:

```powershell
netstat -ano | Select-String ':3000'
```

Stop the conflicting process or run the console on a different port:

```powershell
npm run dev -- --port 3005
```

Use `3000` for the standard local demo when possible.

## Stop Everything

Stop the dashboard with `Ctrl+C` in its terminal.

Stop backend services:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

If a clean reset is needed, use Docker Desktop carefully. Do not remove volumes unless you intentionally want to delete local TimescaleDB and Kafka data.

