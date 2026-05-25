$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$ImportantTopics = @(
  "raw.telemetry",
  "normalized.telemetry",
  "semantic.enriched",
  "ieee20305.translated",
  "grid.signals",
  "dispatch.command.proposed",
  "dispatch.command.audit",
  "dispatch.approval.audit",
  "dispatch.command.ready",
  "dispatch.command.mock.sent",
  "dispatch.command.mock.result",
  "dispatch.mock.audit",
  "device.command.result",
  "device.command.audit",
  "security.gateway.audit",
  "dataspace.catalog",
  "dataspace.export.audit"
)

try {
  $ListedTopics = docker compose exec -T kafka kafka-topics --bootstrap-server kafka:29092 --list
} catch {
  Write-Error "Could not list Kafka topics. Make sure Kafka is running. $($_.Exception.Message)"
}

$ImportantTopics |
  ForEach-Object {
    [pscustomobject]@{
      Topic = $_
      Present = $ListedTopics -contains $_
    }
  } |
  Format-Table -AutoSize

Write-Host ""
Write-Host "Useful one-shot consumer commands:"
foreach ($Topic in $ImportantTopics) {
  Write-Host "docker compose exec -T kafka kafka-console-consumer --bootstrap-server kafka:29092 --topic $Topic --from-beginning --max-messages 5"
}
