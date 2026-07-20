param(
  [ValidateSet(100, 1000, 5000, 10000)]
  [int]$Devices = 100,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$partitionMap = @{
  100 = 3
  1000 = 6
  5000 = 12
  10000 = 24
}
$partitions = $partitionMap[$Devices]
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
  } elseif ($current -lt $partitions) {
    docker exec adflex-kafka kafka-topics --bootstrap-server localhost:9092 --alter --topic $topic --partitions $partitions
  }
}

if (-not $Apply) {
  Write-Host "Dry inspection only. Re-run with -Apply to create or increase these topic partitions."
}
