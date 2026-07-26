# Public Laptop Demo Runbook

## Purpose

This runbook starts the complete AD-FLEX platform on a Windows laptop and
publishes only the customer-facing Next.js dashboard through a free
Cloudflare Quick Tunnel.

Quick Tunnel is temporary and intended for a controlled demonstration. It
does not require a domain, Cloudflare account, router port forwarding, or a
paid resource.

## Prerequisites

- Windows PowerShell
- Docker Desktop running Linux containers
- Node.js and npm
- `cloudflared`
- optional for semantic mapping: Ollama with `phi3:mini`

Install `cloudflared` with the free Windows package:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared --version
```

If package installation is unavailable, download the Windows executable from
the official Cloudflare downloads page and place it on `PATH`, or place
`cloudflared.exe` in `.runtime\tools`. The repository does not commit the
binary.

## One-Time Configuration

From the repository:

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
copy .env.example .env
copy .\apps\customer-console\.env.public-demo.example `
  .\apps\customer-console\.env.public-demo
```

Edit `.env` for the local Docker pipeline. Then replace every placeholder in
`apps\customer-console\.env.public-demo`:

```text
GATEWAY_BASE_URL=http://127.0.0.1:3010
EDGE_API_KEY=<same local gateway key used by Docker Compose>
DEMO_USERNAME=<demo operator username>
DEMO_PASSWORD=<strong temporary demo password>
DEMO_SESSION_SECRET=<at least 32 random characters>
PUBLIC_DEMO_MODE=true
```

The `.env.public-demo` file is ignored by Git. Never put its values in
documentation, screenshots, chat, or source control.

## Optional Ollama Setup

```powershell
ollama list
ollama pull phi3:mini
ollama serve
```

Verify:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

The dashboard and pipeline remain available when Ollama is down, but semantic
readings are explicitly failed or safely unmapped according to the mandatory
SLM policy.

## Start The Public Demo

The one-command path starts or verifies Docker, builds the production
dashboard, checks essential services, starts Next.js on loopback, and starts
Quick Tunnel:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\start-public-demo.ps1 -BuildContainers
```

For subsequent starts where container images are current:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\start-public-demo.ps1
```

The command prints:

- local URL: `http://127.0.0.1:3000`
- temporary `https://*.trycloudflare.com` URL
- demo username

It intentionally never prints the password.

## Validate The Boundary

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\check-public-demo.ps1
```

Expected checks:

- local login page returns HTTP 200;
- public login page returns HTTP 200;
- public HTML contains no internal host or loopback address;
- all Docker-published ports bind to `127.0.0.1`.

The raw Quick Tunnel command is:

```powershell
cloudflared tunnel --url http://127.0.0.1:3000
```

Use the scripts for normal operation because they also retain process IDs and
perform lifecycle checks.

## Demonstration Walkthrough

1. Open the printed public URL.
2. Sign in with the separately supplied demo account.
3. Open **Home** and verify the simulated safety notice.
4. Use the household selector to switch between pseudonymized households.
5. Open **Connected devices**.
6. Filter by category, connection, flexibility, or state.
7. Move between server-side result pages.
8. Open a device detail and show current state, recent usage, and flexibility.
9. Open **Energy analytics**, **Flexibility**, **Community**, and **Reports**.
10. Explain that every value comes from simulated telemetry processed through
    the local pipeline.

The customer browser sees neither internal service diagnostics nor raw audit
payloads.

## Local Verification

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
Invoke-RestMethod http://127.0.0.1:3012/health
```

The fleet health response should report 20 households, 241 devices, and
`no_real_execution=true` with the default configuration.

## Stop The Demo

Interactive shutdown:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-public-demo.ps1
```

The script:

1. stops `cloudflared`;
2. checks that the temporary URL no longer responds;
3. stops the production dashboard;
4. asks whether Docker services should also stop;
5. preserves named database and model volumes.

Keep Docker running without a prompt:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\stop-public-demo.ps1 -KeepPipeline -NonInteractive
```

Stop the complete pipeline while preserving volumes:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\stop-public-demo.ps1 -StopPipeline -NonInteractive
```

## Troubleshooting

### Docker is unavailable

Start Docker Desktop and wait until:

```powershell
docker info
```

returns successfully.

### A placeholder variable remains

The start script stops before launching the dashboard. Replace all
`replace-with-...` entries in `.env.public-demo`.

### `cloudflared` is not found

Open a new PowerShell session after `winget install`, or place the executable
in `.runtime\tools\cloudflared.exe`.

### PowerShell blocks scripts

Use the documented form:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-public-demo.ps1
```

This applies only to the launched process and does not change system policy.

### Port 3000 is in use

Stop the previous dashboard:

```powershell
powershell -ExecutionPolicy Bypass -File `
  .\scripts\stop-public-demo.ps1 -KeepPipeline -NonInteractive
```

Then start again.

### Public URL returns a transient Cloudflare error

Quick Tunnel has no availability guarantee. Wait briefly, run
`check-public-demo.ps1`, or stop and start the tunnel to obtain a new
temporary URL.

### The dashboard shows unavailable data

Check:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
docker compose logs --tail 100 security-gateway household-fleet-simulator
```

The UI is designed to remain usable and show a sanitized unavailable state
when an internal read fails.

### Semantic data trails telemetry

The local Phi-3 Mini worker is considerably slower than the 241-device
fleet's normalized-reading stream on the validated laptop. This does not
drop raw or normalized telemetry, but semantic completion can lag and invalid
model output is safely unmapped. Reduce fleet frequency for a semantic-led
walkthrough or use the documented scalable inference architecture for a
larger performance run.
