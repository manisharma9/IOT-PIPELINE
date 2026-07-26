param(
  [int]$DashboardPort = 3000,
  [switch]$BuildContainers,
  [switch]$SkipDashboardBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConsoleRoot = Join-Path $RepoRoot "apps\customer-console"
$EnvironmentFile = Join-Path $ConsoleRoot ".env.public-demo"
$RuntimeDirectory = Join-Path $RepoRoot ".runtime\public-demo"
New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null
Set-Location $RepoRoot

if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
  throw "Create apps/customer-console/.env.public-demo from .env.public-demo.example and replace every placeholder."
}

foreach ($Line in Get-Content -LiteralPath $EnvironmentFile) {
  $Trimmed = $Line.Trim()
  if (-not $Trimmed -or $Trimmed.StartsWith("#") -or -not $Trimmed.Contains("=")) {
    continue
  }
  $Name, $Value = $Trimmed.Split("=", 2)
  [Environment]::SetEnvironmentVariable($Name.Trim(), $Value.Trim(), "Process")
}

$Required = @("GATEWAY_BASE_URL", "EDGE_API_KEY", "DEMO_USERNAME", "DEMO_PASSWORD", "DEMO_SESSION_SECRET")
foreach ($Name in $Required) {
  $Value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if (-not $Value -or $Value.StartsWith("replace-with-")) {
    throw "$Name must be set to a non-placeholder value in apps/customer-console/.env.public-demo."
  }
}
if ($env:DEMO_SESSION_SECRET.Length -lt 32) {
  throw "DEMO_SESSION_SECRET must contain at least 32 characters."
}
$env:PUBLIC_DEMO_MODE = "true"
$env:NEXT_PUBLIC_DEPLOYMENT_MODE = "public-demo"

docker info | Out-Null
Write-Host "Docker Desktop is running."

$ComposeArguments = @("compose", "-f", "docker-compose.yml", "-f", "docker-compose.public-demo.yml", "up", "-d")
if ($BuildContainers) {
  $ComposeArguments += "--build"
}
& docker @ComposeArguments
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose failed to start the AD-FLEX stack."
}

for ($Attempt = 0; $Attempt -lt 60; $Attempt += 1) {
  try {
    $Gateway = Invoke-RestMethod -Uri "http://127.0.0.1:3010/health" -TimeoutSec 5
    $Fleet = Invoke-RestMethod -Uri "http://127.0.0.1:3012/health" -TimeoutSec 5
    if ($Gateway.status -and $Fleet.status) { break }
  } catch {
    if ($Attempt -eq 59) { throw "Essential services did not become healthy in time." }
    Start-Sleep -Seconds 2
  }
}
Write-Host "Security gateway and household fleet are responding."

$MigrationPath = Join-Path $RepoRoot "database\timescale\012_simulated_device_registry.sql"
$TimescaleUser = if ($env:TIMESCALE_USER) { $env:TIMESCALE_USER } else { "energy_user" }
$TimescaleDatabase = if ($env:TIMESCALE_DB) { $env:TIMESCALE_DB } else { "energy_flex" }
Get-Content -LiteralPath $MigrationPath -Raw |
  docker exec -i adflex-timescaledb psql `
    -U $TimescaleUser `
    -d $TimescaleDatabase `
    -v ON_ERROR_STOP=1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Customer device registry migration failed."
}
Write-Host "Customer fleet read-model migration is current."

Push-Location $ConsoleRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $ConsoleRoot "node_modules"))) {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  }
  if (-not $SkipDashboardBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Customer dashboard build failed." }
  }
} finally {
  Pop-Location
}

$DashboardPidFile = Join-Path $RuntimeDirectory "dashboard.pid"
$DashboardStdout = Join-Path $RuntimeDirectory "dashboard.stdout.log"
$DashboardStderr = Join-Path $RuntimeDirectory "dashboard.stderr.log"
if (Test-Path -LiteralPath $DashboardPidFile) {
  $ExistingPidText = (Get-Content -LiteralPath $DashboardPidFile -Raw).Trim()
  if ($ExistingPidText) {
    $ExistingPid = [int]$ExistingPidText
    if (Get-Process -Id $ExistingPid -ErrorAction SilentlyContinue) {
      throw "A recorded dashboard process is already running with PID $ExistingPid."
    }
  }
}
$NodePath = (Get-Command node).Source
$NextCli = Join-Path $ConsoleRoot "node_modules\next\dist\bin\next"
$DashboardProcess = Start-Process `
  -FilePath $NodePath `
  -ArgumentList @($NextCli, "start", "--hostname", "127.0.0.1", "--port", $DashboardPort) `
  -WorkingDirectory $ConsoleRoot `
  -RedirectStandardOutput $DashboardStdout `
  -RedirectStandardError $DashboardStderr `
  -WindowStyle Hidden `
  -PassThru
Set-Content -LiteralPath $DashboardPidFile -Value $DashboardProcess.Id

for ($Attempt = 0; $Attempt -lt 40; $Attempt += 1) {
  try {
    $Local = Invoke-WebRequest `
      -Uri "http://127.0.0.1:$DashboardPort/login" `
      -UseBasicParsing `
      -TimeoutSec 5
    if ($Local.StatusCode -eq 200) { break }
  } catch {
    if ($DashboardProcess.HasExited) {
      throw "The dashboard process exited. Review $DashboardStderr."
    }
    if ($Attempt -eq 39) { throw "The dashboard did not become ready in time." }
    Start-Sleep -Seconds 1
  }
}
Write-Host "Production dashboard is running locally at http://127.0.0.1:$DashboardPort."

& (Join-Path $PSScriptRoot "start-cloudflare-tunnel.ps1") `
  -DashboardPort $DashboardPort `
  -RuntimeDirectory $RuntimeDirectory

$PublicUrl = (Get-Content -LiteralPath (Join-Path $RuntimeDirectory "public-url.current.txt") -Raw).Trim()
Write-Host ""
Write-Host "PUBLIC CUSTOMER DASHBOARD: $PublicUrl" -ForegroundColor Cyan
Write-Host "Demo username: $env:DEMO_USERNAME"
Write-Host "The password is intentionally not printed."
Write-Host "Only the Next.js customer dashboard is the tunnel origin."
