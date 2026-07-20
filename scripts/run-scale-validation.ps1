param(
  [int]$Devices = 10000,
  [int]$Households = 0,
  [int]$IntervalSeconds = 60,
  [int]$DurationMinutes = 30,
  [int]$Cycles = 0,
  [int]$Seed = 20305,
  [int]$RampUpSeconds = 300,
  [double]$BurstPercentage = 10,
  [double]$TargetRate = 0,
  [int]$MaxBacklog = 5000,
  [int]$Concurrency = 64,
  [ValidateSet("steady", "ramp", "burst", "soak")]
  [string]$Mode = "ramp",
  [string]$Output = "docs/scalability-results",
  [switch]$DryRun,
  [int]$MaxMessages = 0
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$arguments = @(
  ".\scripts\run-scale-validation.js",
  "--devices", $Devices,
  "--interval-seconds", $IntervalSeconds,
  "--duration-minutes", $DurationMinutes,
  "--seed", $Seed,
  "--ramp-up-seconds", $RampUpSeconds,
  "--burst-percentage", $BurstPercentage,
  "--max-backlog", $MaxBacklog,
  "--concurrency", $Concurrency,
  "--mode", $Mode,
  "--output", $Output
)

if ($Households -gt 0) { $arguments += @("--households", $Households) }
if ($Cycles -gt 0) { $arguments += @("--cycles", $Cycles) }
if ($TargetRate -gt 0) { $arguments += @("--target-rate", $TargetRate) }
if ($MaxMessages -gt 0) { $arguments += @("--max-messages", $MaxMessages) }
if ($DryRun) { $arguments += "--dry-run" }

& node @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Scale validation generator failed with exit code $LASTEXITCODE."
}
