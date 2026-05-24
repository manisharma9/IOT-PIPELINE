# Troubleshooting

This guide covers common local demo problems.

## Docker Not Running

Symptom:

- Docker commands fail.
- `docker compose config` cannot connect to Docker.

Fix:

```powershell
docker version
```

If Docker is unavailable, start Docker Desktop and wait until it is fully running.

## Docker Compose Version Warning

Symptom:

- Docker Compose prints a warning about the `version` field being obsolete.

Fix:

This is a Docker Compose v2 warning. The demo can still run. It is safe to ignore during local validation.

## Orphan Container Or Protected API Warning

Symptom:

- Compose warns about orphan containers, possibly from older services such as `protected-api`.

Fix:

List containers:

```powershell
docker compose ps -a
```

Remove only orphan containers if you are sure they are no longer needed:

```powershell
docker compose up -d --remove-orphans
```

## Kafka Startup Or Leader Election Warning

Symptom:

- Kafka logs show leader election, coordinator, or topic initialization warnings during startup.

Fix:

Kafka often needs time to settle. Wait 30 to 60 seconds and rerun:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-topics.ps1
```

If Kafka is still unhealthy:

```powershell
docker compose logs kafka --tail=100
docker compose restart kafka
```

## Node Access Denied On Windows

Symptom:

- Local `node` commands fail with access denied.

Fix:

Run tests through Docker Node instead of local Node, or reinstall Node.js with normal user permissions. The project services also run inside Docker Compose.

Example Docker Node syntax check:

```powershell
docker run --rm -v "${PWD}:/work:ro" -w /work node:20-alpine sh -lc "find services -path '*/node_modules/*' -prune -o -name '*.js' -print | xargs -r -n 1 node --check"
```

## Timescale Migration Already Exists

Symptom:

- A service log says a table, hypertable, or migration object already exists.

Fix:

Most migrations use `IF NOT EXISTS`, so this is usually harmless. If the database volume is from an older incompatible run, reset local demo data only if you do not need it:

```powershell
docker compose down
docker volume ls
```

Destructive reset for local demo data:

```powershell
docker compose down -v
```

This deletes local Kafka and TimescaleDB demo data.

## API Key Missing For Dataspace Export

Symptom:

- Dataspace export returns `401 unauthorized_dataspace_request`.

Fix:

Pass the local API key:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3006/dataspace/export/full-pipeline-demo-summary `
  -Headers @{ "x-api-key" = "local-dev-dataspace-key" }
```

## Ollama Or Phi-3 Mini Not Running

Symptom:

- Unknown readings do not get SLM-assisted mapping.

Fix:

Known readings do not require Ollama. To test unknown SLM-assisted mapping, start Ollama and pull the model:

```powershell
ollama pull phi3:mini
ollama serve
```

If Ollama is unavailable, the semantic connector should fall back safely to unmapped output.

## Port Already In Use

Symptom:

- A service cannot bind to a port such as `3001`, `3002`, or `5432`.

Fix:

Find the process:

```powershell
netstat -ano | findstr :3001
```

Stop the conflicting process, stop old Docker containers, or change the service port in `.env`.

## Reset Local Docker Volumes Safely

First stop the demo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

If you need a clean database and Kafka state, run:

```powershell
docker compose down -v
```

Only use `-v` when you are comfortable deleting local demo data.

## Proposal Not Appearing

Fix:

1. Check translator health: `http://localhost:3002/health`.
2. Check aggregator health: `http://localhost:3003/health`.
3. Send the DSO grid signal again.
4. Wait a few seconds.
5. Call:

```powershell
Invoke-RestMethod http://localhost:3003/dispatch/proposals?limit=5
```

## Mock Dispatch Not Appearing

Fix:

Make sure the proposal was reviewed, approved, and marked ready. Mock dispatch only consumes `dispatch.command.ready` events with safety flags.

Check audit:

```powershell
Invoke-RestMethod http://localhost:3005/mock-dispatch/audit?limit=5
```
