param(
  [string]$OllamaBaseUrl = "http://localhost:11434",
  [string]$Model = "phi3:mini",
  [string]$GatewayBaseUrl = "http://localhost:3010",
  [string]$EdgeApiKey = "local-dev-edge-key",
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message"
}

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Invoke-JsonPost {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body
  )

  Invoke-RestMethod `
    -Method Post `
    -Uri $Uri `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 20)
}

function Invoke-PsqlJsonRows {
  param([string]$Sql)

  $result = docker exec adflex-timescaledb psql `
    -U energy_user `
    -d energy_flex `
    -t `
    -A `
    -c $Sql

  $rows = @()
  foreach ($line in $result) {
    $text = [string]$line
    if ([string]::IsNullOrWhiteSpace($text) -or $text -eq "null") {
      continue
    }

    $rows += ($text | ConvertFrom-Json)
  }

  return $rows
}

Write-Step "Checking Ollama availability"
$tags = Invoke-RestMethod -Method Get -Uri "$OllamaBaseUrl/api/tags"
$modelNames = @($tags.models | ForEach-Object { $_.name })
Assert-Condition ($modelNames -contains $Model) "Ollama is reachable, but $Model is not installed. Run: ollama pull $Model"

Write-Host "Ollama is reachable at $OllamaBaseUrl"
Write-Host "Installed models:"
ollama list

Write-Step "Running direct Phi-3 Mini JSON smoke prompt"
$directPrompt = @"
Return JSON only. Classify this telemetry reading:
reading_name=grid_stress_index, value=0.82, unit=score.
Use this exact JSON object:
{"saref_type":"saref:Measurement","saref_property":"saref:Property","saref_unit":"unit:UNITLESS","saref4ener_concept":"saref4ener:GridConditionIndicator","ngsi_type":"Property","ngsi_property":"gridStressIndex","mapping_confidence":"medium","explanation":"Grid stress score is a unitless grid condition indicator."}
"@

$directResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "$OllamaBaseUrl/api/generate" `
  -ContentType "application/json" `
  -Body (@{
    model = $Model
    prompt = $directPrompt
    format = "json"
    stream = $false
    options = @{
      temperature = 0.1
    }
  } | ConvertTo-Json -Depth 10)

Assert-Condition (-not [string]::IsNullOrWhiteSpace($directResponse.response)) "Ollama returned an empty direct response."
$directJson = $directResponse.response | ConvertFrom-Json
Assert-Condition ($directJson.mapping_confidence -in @("medium", "high")) "Direct Ollama response was not medium/high confidence."
Write-Host ($directJson | ConvertTo-Json -Depth 10)

Write-Step "Checking local Docker stack"
$gatewayHealthy = $false
try {
  $gatewayHealth = Invoke-RestMethod -Method Get -Uri "$GatewayBaseUrl/health" -TimeoutSec 5
  $gatewayHealthy = $gatewayHealth.status -eq "ok"
} catch {
  $gatewayHealthy = $false
}

if (-not $gatewayHealthy) {
  Write-Host "Gateway is not healthy. Starting local demo stack..."
  powershell -ExecutionPolicy Bypass -File ".\scripts\start-demo.ps1"
  Start-Sleep -Seconds 10
}

$health = Invoke-RestMethod -Method Get -Uri "$GatewayBaseUrl/health"
Assert-Condition ($health.status -eq "ok") "Security gateway is not healthy after startup."

Write-Step "Sending SLM-primary telemetry through security gateway"
$runId = "slm-primary-" + (Get-Date -Format "yyyyMMddHHmmss")
$source = "slm-primary-live-validation-$runId"
$headers = @{
  "x-edge-api-key" = $EdgeApiKey
  "x-correlation-id" = $runId
}

$telemetryCases = @(
  @{
    household_id = "household-slm-shelly"
    community_id = "community-dublin-north"
    device_id = "shelly-plug-001"
    device_type = "shelly_plug"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    readings = @{
      active_power_kw = @{
        value = 1.24
        unit = "kW"
      }
    }
    protocol = "http"
    source = $source
  },
  @{
    household_id = "household-slm-enode"
    community_id = "community-dublin-north"
    device_id = "easee-core-001"
    device_type = "ev_charger"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    readings = @{
      ev_charging_power_kw = @{
        value = 4.8
        unit = "kW"
      }
    }
    protocol = "http"
    source = $source
  },
  @{
    household_id = "household-slm-heat-pump"
    community_id = "community-dublin-north"
    device_id = "heat-pump-001"
    device_type = "heat_pump"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    readings = @{
      roomHeat = @{
        value = 21.7
        unit = "C"
      }
    }
    protocol = "http"
    source = $source
  },
  @{
    household_id = "household-slm-unknown"
    community_id = "community-dublin-north"
    device_id = "grid-sensor-001"
    device_type = "grid_sensor"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    readings = @{
      grid_stress_index = @{
        value = 0.82
        unit = "score"
      }
    }
    protocol = "http"
    source = $source
  }
)

foreach ($payload in $telemetryCases) {
  Invoke-JsonPost -Uri "$GatewayBaseUrl/telemetry" -Headers $headers -Body $payload | Out-Null
}

Write-Step "Polling semantic_events for SLM-primary rows"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$rows = $null
$safeSource = $source.Replace("'", "''")
$requiredReadings = @(
  "active_power_kw",
  "ev_charging_power_kw",
  "roomHeat",
  "grid_stress_index"
)

do {
  Start-Sleep -Seconds 5
  $sql = @"
SELECT row_to_json(q)
FROM (
  SELECT
    reading_name,
    device_id,
    device_type,
    mapping_source,
    mapping_confidence,
    saref_property,
    saref_unit,
    saref4ener_concept,
    semantic_payload->'slm_audit' AS slm_audit
  FROM semantic_events
  WHERE semantic_payload->'original_reading'->>'source' = '$safeSource'
  ORDER BY processed_at DESC
) q;
"@
  $rows = @(Invoke-PsqlJsonRows -Sql $sql)
  $presentReadings = @($rows | ForEach-Object { $_.reading_name } | Sort-Object -Unique)
  $hasAllRequiredReadings = $true
  foreach ($reading in $requiredReadings) {
    if ($presentReadings -notcontains $reading) {
      $hasAllRequiredReadings = $false
    }
  }
} while (-not $hasAllRequiredReadings -and (Get-Date) -lt $deadline)

Assert-Condition ($rows.Count -ge 4) "Expected 4 semantic rows for source $source, found $($rows.Count)."

foreach ($reading in $requiredReadings) {
  $row = $rows | Where-Object { $_.reading_name -eq $reading } | Select-Object -First 1
  Assert-Condition ($null -ne $row) "Missing semantic row for $reading"
  Assert-Condition ($row.mapping_source -eq "slm_primary") "$reading did not use slm_primary. Actual: $($row.mapping_source)"
  Assert-Condition ($row.slm_audit.slm_called -eq $true) "$reading did not record slm_called=true"
  Assert-Condition ($row.slm_audit.slm_model -eq $Model) "$reading did not record slm_model=$Model"
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($row.slm_audit.slm_confidence)) "$reading missing slm_confidence"
  Assert-Condition ([string]::IsNullOrWhiteSpace([string]$row.slm_audit.fallback_reason)) "$reading unexpectedly fell back: $($row.slm_audit.fallback_reason)"
  Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$row.slm_audit.deterministic_validation)) "$reading missing deterministic_validation audit field"

  if ($reading -in @("active_power_kw", "ev_charging_power_kw")) {
    Assert-Condition ($row.slm_audit.deterministic_validation -eq "passed") "$reading did not pass deterministic validation after SLM mapping."
  }
}

Write-Host ($rows | ConvertTo-Json -Depth 20)

Write-Step "Checking deterministic fallback still works with unavailable SLM"
$fallbackOutput = @'
const { resolveSemanticMapping } = require("./services/semantic-connector/src/index");

(async () => {
  const mapping = await resolveSemanticMapping({
    event_time: "2026-06-07T19:00:00.000Z",
    household_id: "household-fallback",
    community_id: "community-dublin-north",
    device_id: "meter-fallback",
    device_type: "smart_meter",
    reading_name: "active_power_kw",
    reading_value: 1.5,
    reading_unit: "kW",
    protocol: "http",
    source: "slm-primary-fallback-check"
  }, {
    slmEnabled: true,
    slmPrimary: true,
    slmModel: "phi3:mini",
    slmMapper: async () => null
  });
  console.log(JSON.stringify(mapping));
})();
'@ | node -

$fallback = $fallbackOutput | ConvertFrom-Json
Assert-Condition ($fallback.mapping_source -eq "deterministic_fallback") "Fallback check did not use deterministic_fallback."
Assert-Condition ($fallback.fallback_reason -eq "slm_unavailable") "Fallback check did not record slm_unavailable."

Write-Step "SLM-primary validation passed"
@{
  ollama_available = $true
  model = $Model
  live_source = $source
  semantic_rows = $rows.Count
  fallback_mapping_source = $fallback.mapping_source
  fallback_reason = $fallback.fallback_reason
} | ConvertTo-Json -Depth 20
