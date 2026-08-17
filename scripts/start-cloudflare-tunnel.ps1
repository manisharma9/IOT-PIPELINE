param(
  [int]$DashboardPort = 3000,
  [string]$RuntimeDirectory = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $RuntimeDirectory) {
  $RuntimeDirectory = Join-Path $RepoRoot ".runtime\public-demo"
}
$RuntimeDirectory = [System.IO.Path]::GetFullPath($RuntimeDirectory)
New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null

$Cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($Cloudflared) {
  $CloudflaredPath = $Cloudflared.Source
} else {
  $Candidates = @(
    (Join-Path $RepoRoot ".runtime\tools\cloudflared.exe"),
    (Join-Path $RepoRoot "tools\cloudflared.exe")
  )
  $CloudflaredPath = $Candidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
  if (-not $CloudflaredPath) {
    throw @"
cloudflared was not found.
Install the free Windows binary or MSI from:
https://developers.cloudflare.com/tunnel/downloads/
Then ensure cloudflared.exe is on PATH and run this script again.
"@
  }
}

$PidFile = Join-Path $RuntimeDirectory "cloudflared.pid"
$UrlFile = Join-Path $RuntimeDirectory "public-url.current.txt"
$StdoutLog = Join-Path $RuntimeDirectory "cloudflared.stdout.log"
$StderrLog = Join-Path $RuntimeDirectory "cloudflared.stderr.log"

if (Test-Path -LiteralPath $PidFile) {
  $ExistingPidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  if ($ExistingPidText) {
    $ExistingPid = [int]$ExistingPidText
    if (Get-Process -Id $ExistingPid -ErrorAction SilentlyContinue) {
      throw "cloudflared is already running with PID $ExistingPid."
    }
  }
}

foreach ($RuntimeFile in @($UrlFile, $StdoutLog, $StderrLog)) {
  if (Test-Path -LiteralPath $RuntimeFile) {
    Set-Content -LiteralPath $RuntimeFile -Value ""
  }
}
$Origin = "http://127.0.0.1:$DashboardPort"
$Process = Start-Process `
  -FilePath $CloudflaredPath `
  -ArgumentList @("tunnel", "--no-autoupdate", "--url", $Origin) `
  -RedirectStandardOutput $StdoutLog `
  -RedirectStandardError $StderrLog `
  -WindowStyle Hidden `
  -PassThru
Set-Content -LiteralPath $PidFile -Value $Process.Id

$PublicUrl = $null
for ($Attempt = 0; $Attempt -lt 60; $Attempt += 1) {
  Start-Sleep -Seconds 1
  if ($Process.HasExited) {
    $Detail = if (Test-Path -LiteralPath $StderrLog) {
      Get-Content -LiteralPath $StderrLog -Raw
    } else {
      "No cloudflared error log was produced."
    }
    throw "cloudflared exited before creating a URL. $Detail"
  }
  $Logs = @()
  if (Test-Path -LiteralPath $StdoutLog) {
    $Logs += Get-Content -LiteralPath $StdoutLog -Raw
  }
  if (Test-Path -LiteralPath $StderrLog) {
    $Logs += Get-Content -LiteralPath $StderrLog -Raw
  }
  $Match = [regex]::Match(($Logs -join "`n"), "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($Match.Success) {
    $PublicUrl = $Match.Value
    break
  }
}

if (-not $PublicUrl) {
  Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  throw "Timed out waiting for a trycloudflare.com URL. Review $StderrLog."
}

Set-Content -LiteralPath $UrlFile -Value $PublicUrl
Write-Host ""
Write-Host "Cloudflare Quick Tunnel is running." -ForegroundColor Green
Write-Host "Public dashboard: $PublicUrl" -ForegroundColor Cyan
Write-Host "Origin: $Origin"
Write-Host "Process ID: $($Process.Id)"
Write-Host "The URL is temporary and stops working when cloudflared stops."
