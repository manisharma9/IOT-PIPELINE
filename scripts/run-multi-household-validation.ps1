param(
  [int]$Households = 5,
  [int]$Cycles = 1,
  [int]$MinIntervalMs = 300,
  [int]$MaxIntervalMs = 1400,
  [int]$TimeoutSeconds = 2400,
  [switch]$StartStack
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

if ($StartStack) {
  powershell -ExecutionPolicy Bypass -File ".\scripts\start-demo.ps1" -Build
}

$OutputPath = Join-Path $RepoRoot "docs\demo-assets\multi-household-validation-results.json"

node ".\scripts\run-multi-household-validation.js" `
  --households $Households `
  --cycles $Cycles `
  --min-interval-ms $MinIntervalMs `
  --max-interval-ms $MaxIntervalMs `
  --timeout-seconds $TimeoutSeconds `
  --output $OutputPath

if ($LASTEXITCODE -ne 0) {
  throw "Multi-household validation failed with exit code $LASTEXITCODE."
}

Write-Host "Multi-household validation completed."
Write-Host "Evidence: $OutputPath"

