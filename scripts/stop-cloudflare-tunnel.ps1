param(
  [string]$RuntimeDirectory = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $RuntimeDirectory) {
  $RuntimeDirectory = Join-Path $RepoRoot ".runtime\public-demo"
}
$RuntimeDirectory = [System.IO.Path]::GetFullPath($RuntimeDirectory)
$PidFile = Join-Path $RuntimeDirectory "cloudflared.pid"
$UrlFile = Join-Path $RuntimeDirectory "public-url.current.txt"

if (Test-Path -LiteralPath $PidFile) {
  $CloudflaredPidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  if ($CloudflaredPidText) {
    $CloudflaredPid = [int]$CloudflaredPidText
    $Process = Get-Process -Id $CloudflaredPid -ErrorAction SilentlyContinue
    if ($Process) {
      Stop-Process -Id $CloudflaredPid -Force
      $Process.WaitForExit()
      Write-Host "Stopped cloudflared process $CloudflaredPid."
    } else {
      Write-Host "Recorded cloudflared process is no longer running."
    }
  } else {
    Write-Host "No active Cloudflare Quick Tunnel PID was recorded."
  }
  Set-Content -LiteralPath $PidFile -Value ""
} else {
  Write-Host "No Cloudflare Quick Tunnel PID file was found."
}

if (Test-Path -LiteralPath $UrlFile) {
  $PublicUrl = (Get-Content -LiteralPath $UrlFile -Raw).Trim()
  if ($PublicUrl) {
    Start-Sleep -Seconds 2
    try {
      Invoke-WebRequest `
        -Uri $PublicUrl `
        -Method Get `
        -UseBasicParsing `
        -TimeoutSec 8 | Out-Null
      Write-Warning "The temporary URL still responded during the immediate shutdown check; edge expiry can take a short moment."
    } catch {
      Write-Host "Confirmed the temporary URL is no longer reachable." -ForegroundColor Green
    }
  }
  Set-Content -LiteralPath $UrlFile -Value ""
}
