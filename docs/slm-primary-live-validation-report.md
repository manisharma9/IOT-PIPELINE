# SLM-Primary Live Validation Report

## Summary

Real local SLM-primary semantic mapping was validated end to end with Ollama and Phi-3 Mini.

Result:

- Ollama was installed and reachable at `http://localhost:11434`.
- `phi3:mini` was available locally.
- Direct Ollama `/api/generate` returned valid JSON.
- Live telemetry through the security gateway produced `semantic_events` rows with `mapping_source = slm_primary`.
- Deterministic SAREF4ENER validation still ran for known readings.
- Fallback still worked when the SLM mapper was unavailable in the controlled fallback check.
- The full gateway demo still passed.

## Ollama Status

Commands checked:

```powershell
ollama --version
ollama list
Invoke-RestMethod http://localhost:11434/api/tags
```

Observed:

```text
ollama version is 0.30.5
phi3:mini    4f2222927938    2.2 GB
```

`http://localhost:11434/api/tags` returned `phi3:mini`.

If this model is missing on another machine, run:

```powershell
ollama pull phi3:mini
ollama run phi3:mini
```

For Docker-based semantic connector validation, the local `.env` must allow enough time for Phi-3 Mini:

```text
SLM_TIMEOUT_MS=30000
```

## Direct Ollama Test Result

The direct smoke prompt asked Phi-3 Mini to classify `grid_stress_index`.

Observed response:

```json
{
  "saref_type": "saref:Measurement",
  "saref_property": "saref:Property",
  "saref_unit": "unit:UNITLESS",
  "saref4ener_concept": "saref4ener:GridConditionIndicator",
  "ngsi_type": "Property",
  "ngsi_property": "gridStressIndex",
  "mapping_confidence": "medium",
  "explanation": "Grid stress score is a unitless grid condition indicator."
}
```

## Pipeline Test Result

Command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-slm-primary.ps1
```

The script sent four telemetry cases through `http://localhost:3010/telemetry`:

- Shelly Plug: `active_power_kw`
- Enode / Easee Core EV charger: `ev_charging_power_kw`
- Heat Pump: `roomHeat`
- Unknown valid telemetry shape: `grid_stress_index`

All four rows used `mapping_source = slm_primary`.

Sample rows:

```json
[
  {
    "reading_name": "grid_stress_index",
    "device_id": "grid-sensor-001",
    "device_type": "grid_sensor",
    "mapping_source": "slm_primary",
    "mapping_confidence": "medium",
    "saref_property": "saref:Property",
    "saref_unit": "unit:UNITLESS",
    "saref4ener_concept": "saref4ener:GridConditionIndicator",
    "slm_audit": {
      "slm_model": "phi3:mini",
      "slm_called": true,
      "slm_confidence": "medium",
      "fallback_reason": null,
      "validation_source": "slm_guardrails",
      "deterministic_validation": "not_available"
    }
  },
  {
    "reading_name": "roomHeat",
    "device_id": "heat-pump-001",
    "device_type": "heat_pump",
    "mapping_source": "slm_primary",
    "mapping_confidence": "medium",
    "saref_property": "saref:Temperature",
    "saref_unit": "unit:DEG_C",
    "saref4ener_concept": "saref4ener:TemperatureMeasurement",
    "slm_audit": {
      "slm_model": "phi3:mini",
      "slm_called": true,
      "slm_confidence": "medium",
      "fallback_reason": null,
      "validation_source": "slm_guardrails",
      "deterministic_validation": "not_available"
    }
  },
  {
    "reading_name": "ev_charging_power_kw",
    "device_id": "easee-core-001",
    "device_type": "ev_charger",
    "mapping_source": "slm_primary",
    "mapping_confidence": "high",
    "saref_property": "saref:Power",
    "saref_unit": "unit:KiloW",
    "saref4ener_concept": "saref4ener:EVChargingDemandMeasurement",
    "slm_audit": {
      "slm_model": "phi3:mini",
      "slm_called": true,
      "slm_confidence": "high",
      "fallback_reason": null,
      "validation_source": "deterministic_validation",
      "deterministic_validation": "passed"
    }
  },
  {
    "reading_name": "active_power_kw",
    "device_id": "shelly-plug-001",
    "device_type": "shelly_plug",
    "mapping_source": "slm_primary",
    "mapping_confidence": "high",
    "saref_property": "saref:Power",
    "saref_unit": "unit:KiloW",
    "saref4ener_concept": "saref4ener:PowerMeasurement",
    "slm_audit": {
      "slm_model": "phi3:mini",
      "slm_called": true,
      "slm_confidence": "high",
      "fallback_reason": null,
      "validation_source": "deterministic_validation",
      "deterministic_validation": "passed"
    }
  }
]
```

## Fallback Test Result

The smoke script also ran a controlled fallback check by calling the semantic mapping module with an unavailable SLM mapper.

Observed:

```json
{
  "fallback_mapping_source": "deterministic_fallback",
  "fallback_reason": "slm_unavailable"
}
```

This confirms deterministic fallback remains active.

## Validation Commands Run

Completed successfully:

```powershell
docker compose config
docker compose config --services
npm.cmd test
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\test-slm-primary.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
```

Also completed:

- Node syntax checks for modified semantic connector source files.
- PowerShell syntax checks for `scripts/*.ps1`.
- Full Node test loop for every package that defines a `test` script.

## Warnings

- Docker Compose still emits the existing warning that the top-level `version` attribute is obsolete.
- `apps/customer-console` and `services/mqtt-subscriber` do not define `npm test` scripts and were skipped by the package test loop.
- Real Phi-3 Mini calls are slower than mocked tests. `SLM_TIMEOUT_MS=30000` is required for reliable local validation on this machine.

## Conclusion

Phi-3 Mini was actually available and used through local Ollama. At least one live telemetry message used `mapping_source = slm_primary`; the dedicated smoke script confirmed four live telemetry messages used `slm_primary`.

No cloud AI API was added. No real device control was added.
