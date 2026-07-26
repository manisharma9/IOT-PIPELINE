param(
  [switch]$KeepDashboard,
  [switch]$StopPipeline,
  [switch]$KeepPipeline,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDirectory = Join-Path $RepoRoot ".runtime\public-demo"

& (Join-Path $PSScriptRoot "stop-cloudflare-tunnel.ps1") -RuntimeDirectory $RuntimeDirectory

if (-not $KeepDashboard) {
  $DashboardPidFile = Join-Path $RuntimeDirectory "dashboard.pid"
  if (Test-Path -LiteralPath $DashboardPidFile) {
    $DashboardPidText = (Get-Content -LiteralPath $DashboardPidFile -Raw).Trim()
    if ($DashboardPidText) {
      $DashboardPid = [int]$DashboardPidText
      $DashboardProcess = Get-Process -Id $DashboardPid -ErrorAction SilentlyContinue
      if ($DashboardProcess) {
        Stop-Process -Id $DashboardPid -Force
        $DashboardProcess.WaitForExit()
        Write-Host "Stopped customer dashboard process $DashboardPid."
      }
    }
    Set-Content -LiteralPath $DashboardPidFile -Value ""
  }
}

$ShouldStopPipeline = $StopPipeline
if (-not $StopPipeline -and -not $KeepPipeline -and -not $NonInteractive) {
  $Answer = Read-Host "Stop the complete local Docker pipeline as well? (y/N)"
  $ShouldStopPipeline = $Answer -match "^[Yy]"
}
if ($ShouldStopPipeline) {
  Set-Location $RepoRoot
  docker compose -f docker-compose.yml -f docker-compose.public-demo.yml stop
  Write-Host "Stopped the Docker pipeline. Named database and model volumes were preserved."
} else {
  Write-Host "Docker pipeline left running."
}
