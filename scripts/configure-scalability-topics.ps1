param(
  [ValidateSet(100, 250, 500, 1000, 5000, 10000)]
  [int]$Devices = 100,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$partitionMap = @{
  100 = 3
  250 = 3
  500 = 6
  1000 = 6
  5000 = 12
  10000 = 24
}
$partitions = $partitionMap[$Devices]
$partitionsChanged = $false
$topics = @(
  "raw.telemetry",
  "normalized.telemetry",
  "semantic.enriched",
  "semantic.mapping.retry",
  "semantic.mapping.dlq"
)

Write-Host "Recommended partition count for $Devices devices: $partitions"
Write-Host "This operation only increases partition counts. Kafka cannot reduce partitions in place."

foreach ($topic in $topics) {
  $describe = docker exec adflex-kafka kafka-topics --bootstrap-server localhost:9092 --describe --topic $topic 2>$null
  $describeText = $describe -join "`n"
  $current = 0
  if ($describeText -match "PartitionCount:\s*(\d+)") { $current = [int]$Matches[1] }
  Write-Host "$topic current=$current recommended=$partitions"
  if (-not $Apply) { continue }
  if ($current -eq 0) {
    docker exec adflex-kafka kafka-topics --bootstrap-server localhost:9092 --create --topic $topic --partitions $partitions --replication-factor 1
    if ($LASTEXITCODE -ne 0) { throw "Could not create Kafka topic $topic." }
    $partitionsChanged = $true
  } elseif ($current -lt $partitions) {
    docker exec adflex-kafka kafka-topics --bootstrap-server localhost:9092 --alter --topic $topic --partitions $partitions
    if ($LASTEXITCODE -ne 0) { throw "Could not increase partitions for Kafka topic $topic." }
    $partitionsChanged = $true
  }
}

if (-not $Apply) {
  Write-Host "Dry inspection only. Re-run with -Apply to create or increase these topic partitions."
} elseif ($partitionsChanged) {
  Write-Host "Restarting active pipeline consumers before the next workload so new empty partitions receive starting offsets."
  docker compose restart engine semantic-connector
  if ($LASTEXITCODE -ne 0) {
    throw "Topic partitions changed, but consumer restart failed. Do not start a workload until consumers are healthy."
  }
  Start-Sleep -Seconds 8
}
