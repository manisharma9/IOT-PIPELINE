param(
  [ValidateSet(100, 1000, 5000, 10000)]
  [int]$Devices = 100,
  [int]$Households = 0,
  [int]$IntervalSeconds = 60,
  [int]$DurationMinutes = 1,
  [int]$Cycles = 1,
  [int]$RampUpSeconds = 0,
  [double]$TargetRate = 0,
  [int]$MaxBacklog = 5000,
  [int]$MaxClearanceSeconds = 900,
  [int]$Concurrency = 64,
  [string]$Output = "docs/scalability-results",
  [switch]$SkipWorkflow
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$arguments = @(
  ".\scripts\run-scale-stage.js",
  "--devices", $Devices,
  "--interval-seconds", $IntervalSeconds,
  "--duration-minutes", $DurationMinutes,
  "--cycles", $Cycles,
  "--ramp-up-seconds", $RampUpSeconds,
  "--max-backlog", $MaxBacklog,
  "--max-clearance-seconds", $MaxClearanceSeconds,
  "--concurrency", $Concurrency,
  "--mode", "steady",
  "--output", $Output
)
if ($Households -gt 0) { $arguments += @("--households", $Households) }
if ($TargetRate -gt 0) { $arguments += @("--target-rate", $TargetRate) }
if ($SkipWorkflow) { $arguments += "--skip-workflow" }

& node @arguments
$exitCode = $LASTEXITCODE
if ($exitCode -eq 2) {
  throw "The measured $Devices-device stage did not satisfy every pass criterion. Review its stage-result.json before attempting the next stage."
}
if ($exitCode -ne 0) {
  throw "The measured $Devices-device stage failed to execute (exit code $exitCode)."
}
