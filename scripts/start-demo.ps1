param(
  [switch]$Build
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$Services = @(
  "zookeeper",
  "kafka",
  "mqtt-broker",
  "timescaledb",
  "ingestion-api",
  "mqtt-subscriber",
  "engine",
  "semantic-connector",
  "ieee20305-translator",
  "aggregator",
  "approval-workflow",
  "mock-dispatch-adapter",
  "shelly-simulator",
  "enode-simulator",
  "device-command-translator",
  "dataspace-export",
  "security-gateway"
)

Write-Host "Starting AD-FLEX final demo services from $RepoRoot"

if ($Build) {
  docker compose up -d --build @Services
} else {
  docker compose up -d @Services
}

Write-Host ""
Write-Host "Start requested. Give Kafka and TimescaleDB a short moment to settle, then run:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1"
