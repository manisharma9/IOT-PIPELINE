param(
  [ValidateSet(100, 250, 500, 1000)]
  [int]$Assets = 100,
  [ValidateSet("functional", "coverage", "sustained")]
  [string]$TestMode = "functional",
  [int]$IntervalSeconds = 600,
  [int]$ReportingWindowSeconds = 600,
  [int]$Cycles = 1,
  [int]$MaxClearanceSeconds = 7200,
  [int]$Concurrency = 8,
  [string]$ConsumerGroup = "adflex-1000-assets-validation",
  [string]$Output = "docs/scalability-results",
  [switch]$SkipWorkflow
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

if (-not $env:EDGE_API_KEY -and (Test-Path ".env")) {
  $line = Select-String -LiteralPath ".env" -Pattern "^\s*EDGE_API_KEY\s*=" | Select-Object -First 1
  if ($line) { $env:EDGE_API_KEY = $line.Line.Split("=", 2)[1].Trim() }
}
if (-not $env:EDGE_API_KEY) {
  throw "EDGE_API_KEY is required in the process environment or local .env file."
}

# Scale evidence must not be mixed with the continuously scheduled demo fleet.
$runningServices = @(docker compose ps --status running --services 2>$null)
if ($runningServices -contains "household-fleet-simulator") {
  Write-Host "Stopping household-fleet-simulator to isolate the measured population..."
  docker compose stop household-fleet-simulator | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Could not stop household-fleet-simulator before the scale run."
  }
}

$semanticContainer = "iot-pipeline-semantic-connector-1"
$semanticGroup = docker inspect $semanticContainer `
  --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null |
  Select-String '^SEMANTIC_CONNECTOR_GROUP_ID=' |
  Select-Object -First 1
if (-not $semanticGroup) {
  throw "The semantic connector is not running or its consumer group cannot be inspected."
}
$actualGroup = $semanticGroup.Line.Split("=", 2)[1].Trim()
if ($actualGroup -ne $ConsumerGroup) {
  throw "Semantic connector group '$actualGroup' does not match required validation group '$ConsumerGroup'. Recreate the semantic connector with the validation environment before starting."
}

$arguments = @(
  ".\scripts\run-scale-stage.js",
  "--config", ".\config\scale-1000-assets.json",
  "--devices", $Assets,
  "--interval-seconds", $IntervalSeconds,
  "--reporting-window-seconds", $ReportingWindowSeconds,
  "--duration-minutes", ([math]::Max(1, [math]::Ceiling($IntervalSeconds / 60))),
  "--cycles", $Cycles,
  "--ramp-up-seconds", $ReportingWindowSeconds,
  "--target-rate", ($Assets / [double]$ReportingWindowSeconds),
  "--max-clearance-seconds", $MaxClearanceSeconds,
  "--concurrency", $Concurrency,
  "--mode", "staggered",
  "--test-mode", $TestMode,
  "--consumer-group", $ConsumerGroup,
  "--output", $Output
)
if ($SkipWorkflow) { $arguments += "--skip-workflow" }
if ($TestMode -eq "coverage") {
  $arguments += @("--primary-reading-mode", "false", "--max-messages", $Assets)
}

& node @arguments
$exitCode = $LASTEXITCODE
if ($exitCode -eq 2) {
  throw "The measured $Assets-asset stage did not satisfy every functional pass criterion. Review its stage-result.json."
}
if ($exitCode -ne 0) {
  throw "The measured $Assets-asset stage failed to execute (exit code $exitCode)."
}
