# SLM-Primary Semantic Mapping Report

## What Changed

The semantic connector now treats the local SLM mapping layer as the primary semantic interpretation path.

For every valid normalized telemetry reading, the connector attempts to call local Ollama/Phi-3 Mini first when:

- `SLM_ENABLED=true`
- `SLM_PRIMARY=true`

The SLM response is only accepted after strict validation. Deterministic SAREF4ENER mapping remains in the pipeline as validation and fallback.

## Runtime Flow

The semantic connector now follows this order:

```text
normalized.telemetry
-> validate normalized telemetry event
-> call local Phi-3 Mini through Ollama
-> validate SLM JSON shape
-> validate confidence, unit, concept, and safe telemetry-only fields
-> run deterministic SAREF4ENER validation for known readings
-> accept as slm_primary if safe
-> otherwise use deterministic_fallback or unmapped
-> write semantic_events
-> publish semantic.enriched
```

## Mapping Sources

Semantic events now use these mapping paths:

| Mapping source | Meaning |
| --- | --- |
| `slm_primary` | Local Phi-3 Mini produced a valid semantic interpretation and it passed guardrails. For known readings, deterministic validation is recorded separately in the semantic payload. |
| `deterministic_fallback` | The SLM was disabled, unavailable, invalid, low confidence, or failed deterministic validation, so a known deterministic SAREF4ENER mapping was used. |
| `unmapped` | Neither SLM nor deterministic mapping produced a safe accepted mapping. |

The semantic payload also records deterministic validation metadata:

- `slm_called`
- `slm_model`
- `slm_confidence`
- `deterministic_validation`
- `validation_source`
- `fallback_reason`

Raw SLM prompts are not stored.

## Configuration

The local defaults now enable SLM-primary mapping:

```text
SLM_ENABLED=true
SLM_PRIMARY=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
SLM_MODEL=phi3:mini
OLLAMA_MODEL=phi3:mini
SLM_TIMEOUT_MS=30000
SLM_MIN_CONFIDENCE=medium
```

`SLM_MODEL` is preferred. `OLLAMA_MODEL` remains for backward compatibility.

If Ollama is not running, the pipeline continues to work. Known readings fall back to deterministic SAREF4ENER mapping. Unknown readings are stored safely as `unmapped`.

## Safety Checks

The connector rejects SLM output when it:

- is not valid JSON
- is missing required mapping fields
- includes unexpected fields
- includes device or household identity fields
- includes command, dispatch, setpoint, or executable action fields
- has confidence below `SLM_MIN_CONFIDENCE`
- suggests unsupported SAREF4ENER concepts
- suggests unsupported or impossible units
- uses units incompatible with the normalized telemetry unit
- conflicts with deterministic SAREF4ENER validation for known readings
- includes unsafe or overly long explanation text

The SLM is only allowed to classify telemetry semantics. It cannot create executable commands or device-control instructions.

## Files Updated

- `services/semantic-connector/src/index.js`
- `services/semantic-connector/src/slm-mapper.js`
- `services/semantic-connector/src/slm-validation.js`
- `services/semantic-connector/src/semantic-builder.js`
- `services/semantic-connector/src/saref4ener-mapping.js`
- `services/semantic-connector/package.json`
- `services/semantic-connector/test/semantic-connector-flow.test.js`
- `services/semantic-connector/test/slm-validation.test.js`
- `services/semantic-connector/test/slm-mapper.test.js`
- `services/semantic-connector/test/saref4ener-mapping.test.js`
- `.env.example`
- `docker-compose.yml`
- `readme.md`
- `docs/final-architecture.md`
- `docs/final-demo-runbook.md`
- `docs/final-presentation-script.md`
- `docs/troubleshooting.md`
- `docs/diagram-alignment-matrix.md`
- `docs/scope-alignment-device-api-translation-report.md`

## Validation Results

Completed successfully:

- `npm.cmd test` in `services/semantic-connector`
- Full Node test suite for packages with a `test` script
- `npm.cmd run lint` in `apps/customer-console`
- `npm.cmd run build` in `apps/customer-console`
- `npm.cmd run check:client-boundary` in `apps/customer-console`
- Node syntax checks for modified semantic connector source files
- PowerShell script syntax check for `scripts/*.ps1`
- `docker compose config`
- `docker compose config --services`
- `scripts/check-health.ps1`
- `scripts/run-full-demo-through-gateway.ps1`

Notes:

- `apps/customer-console` and `services/mqtt-subscriber` do not define `npm test` scripts, so they were skipped by the full test loop.
- Docker Compose still emits the existing warning that the `version` attribute is obsolete.
- Live validation showed recent known telemetry rows using `deterministic_fallback` with `slm_called=true` and `fallback_reason=slm_unavailable`, confirming that the connector tried SLM first and fell back safely when local Ollama was unavailable.

## Current Behaviour

The full local demo still runs end to end through the security gateway. Telemetry enters through the gateway, reaches the semantic connector, and continues through IEEE 2030.5-style translation, aggregation, approval, mock dispatch, simulated device command translation, and dataspace export.

No cloud AI was added. No real device control was added.
