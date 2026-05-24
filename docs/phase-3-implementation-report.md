# Phase 3 Implementation Report

## 1. Phase 3 Overview

Phase 3 adds optional SLM-assisted semantic mapping for unknown telemetry readings.

Phase 1 created the ingestion, Kafka, engine, and TimescaleDB foundation. Phase 2 added deterministic SAREF4ENER-style semantic enrichment. Phase 3 keeps both of those flows intact and only extends the unknown-reading fallback path.

What Phase 3 added:

- optional Phi-3 Mini mapping suggestions through local Ollama
- a safe Ollama client for `POST /api/generate`
- strict validation for model output
- fallback to the existing `unmapped` result when SLM is disabled, unavailable, slow, or invalid
- an unknown telemetry example payload
- tests for deterministic, SLM-assisted, and fallback behavior

Phase 3 does not add IEEE 2030.5, aggregator dispatch, or ENERSHARE export.

## 2. Why SLM Was Added

The deterministic SAREF4ENER mapping in Phase 2 works well for known readings such as `active_power_kw`, `voltage_v`, and `battery_soc_percent`.

Real household telemetry can still contain unknown names such as:

- `grid_stress_index`
- `roomHeat`
- vendor-specific fields
- local gateway labels

Before Phase 3, those readings were stored and published as `unmapped`. That was safe, but it did not provide a suggested semantic interpretation.

Phase 3 adds an optional SLM step so unknown readings can receive a proposed semantic mapping while still preserving safety and auditability.

## 3. Why Deterministic Mapping Still Comes First

Known readings must be stable and predictable. A model should not reinterpret `active_power_kw` differently from one run to another.

The Phase 3 order is therefore:

```text
normalized.telemetry
  -> validate normalized event
  -> deterministic SAREF4ENER lookup
  -> known reading: use deterministic mapping
  -> unknown reading and SLM_ENABLED=true: ask SLM
  -> invalid SLM or unavailable Ollama: use unmapped fallback
  -> build semantic event
  -> write semantic_events
  -> publish semantic.enriched
```

Known readings never call the SLM.

## 4. How SLM Is Used Only For Unknown Readings

The semantic connector first calls the existing deterministic mapping function.

If the result has:

```text
mapping_source = deterministic
```

the connector immediately uses that mapping.

If the result has:

```text
mapping_source = unmapped
```

and:

```text
SLM_ENABLED=true
```

the connector calls the SLM mapper. If the SLM response is valid, the semantic event uses:

```text
mapping_source = slm_assisted
```

If the SLM is disabled, unavailable, times out, or returns malformed output, the event remains:

```text
mapping_source = unmapped
```

The pipeline keeps running in all cases.

## 5. How Ollama And Phi-3 Mini Fit In

Ollama runs locally and exposes an HTTP API. Phase 3 uses:

```text
POST /api/generate
```

The default model is:

```text
phi3:mini
```

The semantic connector sends the unknown normalized reading as context and asks the model to return JSON only.

The default configuration is:

```text
SLM_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=phi3:mini
SLM_TIMEOUT_MS=8000
```

Inside Docker Desktop on Windows, `host.docker.internal` lets the semantic connector container reach Ollama running on the host machine.

## 6. File-By-File Explanation

### `.env.example`

Adds Phase 3 SLM configuration:

- `SLM_ENABLED`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `SLM_TIMEOUT_MS`

### `docker-compose.yml`

Passes the SLM configuration into the `semantic-connector` service.

The default compose fallback keeps SLM disabled unless the environment enables it:

```text
SLM_ENABLED=${SLM_ENABLED:-false}
```

### `services/semantic-connector/src/slm-mapper.js`

Adds the Ollama client.

It:

- reads SLM environment configuration
- builds a JSON-only prompt
- calls `POST /api/generate`
- uses `OLLAMA_MODEL`
- applies `SLM_TIMEOUT_MS`
- parses the Ollama response safely
- returns `null` if the call fails or the response is not JSON

It never throws errors into the connector flow.

### `services/semantic-connector/src/slm-validation.js`

Adds strict validation for SLM output.

The SLM output must contain string values for:

- `saref_type`
- `saref_property`
- `saref_unit`
- `saref4ener_concept`
- `ngsi_type`
- `ngsi_property`
- `mapping_confidence`
- `explanation`

`mapping_confidence` must be:

- `high`
- `medium`
- `low`

The explanation must be short and safe. Invalid JSON or malformed objects are rejected.

### `services/semantic-connector/src/index.js`

Updates the connector flow.

It now:

- validates normalized telemetry as before
- keeps deterministic mappings for known readings
- calls the SLM only for unknown readings when enabled
- validates SLM output before using it
- falls back to `unmapped` when SLM fails
- writes and publishes the final semantic event as before

### `services/semantic-connector/src/semantic-builder.js`

Expands the semantic payload so each event clearly carries:

- original reading data
- SAREF fields
- SAREF4ENER fields
- NGSI fields
- mapping source
- mapping confidence
- explanation

### `examples/household_unknown_telemetry.json`

Adds a sample payload with unknown readings:

- `grid_stress_index`
- `roomHeat`

This can trigger SLM-assisted mapping when SLM is enabled.

### `services/semantic-connector/test/*.test.js`

Adds tests for:

- known readings staying deterministic
- unknown readings calling a mocked SLM
- valid SLM JSON being accepted
- invalid SLM JSON being rejected
- Ollama failure falling back safely
- `slm_assisted` events carrying the correct mapping source
- fallback events keeping `mapping_source = unmapped`

## 7. Step-By-Step Run Guide

Run commands from the repository root:

```powershell
C:\Users\Mani\Desktop\Github\IOT-PIPELINE
```

Create `.env` if needed:

```powershell
Copy-Item .env.example .env
```

Install and start Ollama on the host machine:

```powershell
ollama pull phi3:mini
ollama serve
```

Start Phase 1, Phase 2, and Phase 3 services:

```powershell
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector
```

Check containers:

```powershell
docker compose ps
```

## 8. Test Known Readings

Send the known sample telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Check semantic rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT reading_name, mapping_source, mapping_confidence FROM semantic_events WHERE reading_name = 'active_power_kw' ORDER BY processed_at DESC LIMIT 5;"
```

Expected result:

```text
mapping_source = deterministic
mapping_confidence = high
```

Known readings should not call Ollama.

## 9. Test Unknown SLM-Assisted Readings

Make sure `.env` contains:

```text
SLM_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=phi3:mini
SLM_TIMEOUT_MS=8000
```

Send the unknown sample telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_unknown_telemetry.json"
```

Check semantic rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT reading_name, mapping_source, mapping_confidence, explanation FROM semantic_events WHERE reading_name IN ('grid_stress_index', 'roomHeat') ORDER BY processed_at DESC LIMIT 10;"
```

Expected result when Ollama is running and returns valid JSON:

```text
mapping_source = slm_assisted
```

Check the enriched Kafka topic:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic semantic.enriched `
  --from-beginning `
  --max-messages 5
```

SLM-assisted events should include `mapping_source` set to `slm_assisted`.

## 10. Test Fallback When Ollama Is Off

Set:

```text
SLM_ENABLED=false
```

or stop Ollama on the host machine.

Restart the semantic connector so it picks up the setting:

```powershell
docker compose up -d --build semantic-connector
```

Send the unknown sample telemetry again:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_unknown_telemetry.json"
```

Check semantic rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT reading_name, mapping_source, mapping_confidence FROM semantic_events WHERE reading_name IN ('grid_stress_index', 'roomHeat') ORDER BY processed_at DESC LIMIT 10;"
```

Expected fallback result:

```text
mapping_source = unmapped
mapping_confidence = low
```

The connector should keep running.

## 11. Local Test Commands

Validate compose configuration:

```powershell
docker compose config
```

Run Node tests:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js
```

## 12. Limitations

Phase 3 is intentionally limited:

- SLM suggestions are not ontology certification.
- SLM output is accepted only after strict shape validation.
- The model can still make weak suggestions, so `mapping_confidence` is stored.
- Ollama is optional and local.
- Known deterministic readings do not use the SLM.
- IEEE 2030.5 translation is not implemented.
- Aggregator dispatch is not implemented.
- ENERSHARE export is not implemented.
- Production authentication, authorization, and TLS are still outside this phase.

## 13. Next Phase Recommendation

The next phase should add an IEEE 2030.5 translator after `semantic.enriched`.

Recommended Phase 4 direction:

```text
semantic.enriched
  -> IEEE 2030.5 translator
  -> flexibility-ready grid service payloads
```

That phase should still keep the SAREF4ENER semantic layer as the stable input contract.
