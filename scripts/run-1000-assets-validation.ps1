param(
  [string]$ConsumerGroup = "adflex-1000-assets-validation",
  [string]$Output = "docs/scalability-results",
  [int]$MaxClearanceSeconds = 7200,
  [switch]$Rebuild,
  [switch]$ApplyTopicPartitions,
  [switch]$IncludeCoverage,
  [switch]$IncludeSustained
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is not available."
}

$tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 15
if (-not ($tags.models.name -contains "phi3:mini")) {
  throw "Ollama is reachable, but phi3:mini is not installed. Run: ollama pull phi3:mini"
}

if (-not $env:EDGE_API_KEY -and (Test-Path ".env")) {
  $line = Select-String -LiteralPath ".env" -Pattern "^\s*EDGE_API_KEY\s*=" | Select-Object -First 1
  if ($line) { $env:EDGE_API_KEY = $line.Line.Split("=", 2)[1].Trim() }
}
if (-not $env:EDGE_API_KEY) {
  throw "EDGE_API_KEY is required in the process environment or local .env file."
}

$env:SEMANTIC_CONNECTOR_GROUP_ID = $ConsumerGroup
$env:SLM_BATCH_MAX_READINGS = "8"
$env:SLM_BATCH_MAX_RETRIES = "1"
$env:SEMANTIC_PARTITIONS_CONCURRENTLY = "2"

if ($Rebuild) {
  docker compose build ingestion-api engine semantic-connector security-gateway
  if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }
}

docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Docker stack startup failed." }
docker compose stop household-fleet-simulator *> $null

$timescaleUser = if ($env:TIMESCALE_USER) { $env:TIMESCALE_USER } else { "energy_user" }
$timescaleDatabase = if ($env:TIMESCALE_DB) { $env:TIMESCALE_DB } else { "energy_flex" }
Get-Content -Raw ".\database\timescale\013_scale_population_registry.sql" |
  docker compose exec -T timescaledb psql `
    -U $timescaleUser `
    -d $timescaleDatabase `
    -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Scale registry migration failed." }
Get-Content -Raw ".\database\timescale\014_scale_telemetry_idempotency.sql" |
  docker compose exec -T timescaledb psql `
    -U $timescaleUser `
    -d $timescaleDatabase `
    -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Scale idempotency migration failed." }

docker compose up -d --no-deps --force-recreate semantic-connector
if ($LASTEXITCODE -ne 0) { throw "Semantic validation worker startup failed." }
Start-Sleep -Seconds 8

function Invoke-Stage {
  param(
    [int]$Assets,
    [int]$WindowSeconds,
    [string]$Mode = "functional",
    [int]$IntervalSeconds = 900
  )
  Write-Host "Starting $Mode validation for $Assets assets..."
  & powershell -ExecutionPolicy Bypass -File ".\scripts\run-1000-assets-stage.ps1" `
    -Assets $Assets `
    -TestMode $Mode `
    -IntervalSeconds $IntervalSeconds `
    -ReportingWindowSeconds $WindowSeconds `
    -Cycles 1 `
    -MaxClearanceSeconds $MaxClearanceSeconds `
    -ConsumerGroup $ConsumerGroup `
    -Output $Output
  if ($LASTEXITCODE -ne 0) {
    throw "$Assets-asset $Mode stage did not pass. Later stages were not started."
  }
}

Invoke-Stage -Assets 100 -WindowSeconds 60
Invoke-Stage -Assets 250 -WindowSeconds 150

if ($ApplyTopicPartitions) {
  & powershell -ExecutionPolicy Bypass -File ".\scripts\configure-scalability-topics.ps1" `
    -Devices 1000 -Apply
  if ($LASTEXITCODE -ne 0) { throw "Topic partition increase failed." }
}

Invoke-Stage -Assets 500 -WindowSeconds 300
Invoke-Stage -Assets 1000 -WindowSeconds 600

if ($IncludeCoverage) {
  Invoke-Stage -Assets 100 -WindowSeconds 600 -Mode "coverage"
}
if ($IncludeSustained) {
  Invoke-Stage -Assets 1000 -WindowSeconds 900 -Mode "sustained" -IntervalSeconds 900
}

& node ".\scripts\build-scalability-evidence.js" --root $Output
if ($LASTEXITCODE -ne 0) { throw "Evidence summary generation failed." }

Write-Host "Validation completed. Evidence root: $Output"
