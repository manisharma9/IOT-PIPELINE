param(
  [switch]$Down
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$Services = @(
  "security-gateway",
  "dataspace-export",
  "device-command-translator",
  "enode-simulator",
  "shelly-simulator",
  "household-fleet-simulator",
  "mock-dispatch-adapter",
  "approval-workflow",
  "aggregator",
  "ieee20305-translator",
  "semantic-connector",
  "engine",
  "mqtt-subscriber",
  "ingestion-api",
  "timescaledb",
  "mqtt-broker",
  "kafka",
  "zookeeper"
)

if ($Down) {
  Write-Host "Stopping and removing demo containers, keeping named volumes."
  docker compose down
} else {
  Write-Host "Stopping demo services, keeping containers and named volumes."
  docker compose stop @Services
}
