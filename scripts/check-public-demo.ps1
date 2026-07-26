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
$UrlFile = Join-Path $RuntimeDirectory "public-url.current.txt"
$LocalUrl = "http://127.0.0.1:$DashboardPort"

$LocalResponse = Invoke-WebRequest `
  -Uri "$LocalUrl/login" `
  -Method Get `
  -UseBasicParsing `
  -TimeoutSec 15
if ($LocalResponse.StatusCode -ne 200) {
  throw "Local dashboard login returned $($LocalResponse.StatusCode)."
}
Write-Host "Local dashboard: healthy ($LocalUrl)" -ForegroundColor Green

if (-not (Test-Path -LiteralPath $UrlFile)) {
  throw "No public URL file exists. Start the Quick Tunnel first."
}
$PublicUrl = (Get-Content -LiteralPath $UrlFile -Raw).Trim()
$PublicResponse = Invoke-WebRequest `
  -Uri "$PublicUrl/login" `
  -Method Get `
  -UseBasicParsing `
  -TimeoutSec 20
if ($PublicResponse.StatusCode -ne 200) {
  throw "Public dashboard login returned $($PublicResponse.StatusCode)."
}
$Forbidden = @(
  "localhost:3001",
  "localhost:3002",
  "localhost:3003",
  "localhost:3004",
  "localhost:3005",
  "localhost:3006",
  "localhost:3009",
  "localhost:3010",
  "timescaledb",
  "kafka:29092",
  "security-gateway:3010"
)
foreach ($Value in $Forbidden) {
  if ($PublicResponse.Content -match [regex]::Escape($Value)) {
    throw "Public HTML exposed an internal address: $Value"
  }
}

$PublishedPorts = docker compose ps --format json | ConvertFrom-Json
foreach ($Container in $PublishedPorts) {
  foreach ($Publisher in @($Container.Publishers)) {
    if ($Publisher.PublishedPort -and $Publisher.URL -and $Publisher.URL -ne "127.0.0.1") {
      throw "Container $($Container.Service) publishes port $($Publisher.PublishedPort) beyond loopback."
    }
  }
}

Write-Host "Public dashboard: healthy ($PublicUrl)" -ForegroundColor Green
Write-Host "No internal address was found in the public HTML."
Write-Host "All Docker-published ports are bound to 127.0.0.1."
