param(
  [ValidateSet(1, 2, 4, 8)]
  [int]$Workers = 1,
  [switch]$Build
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$arguments = @("compose", "up", "-d", "--scale", "semantic-connector=$Workers")
if ($Build) { $arguments += "--build" }
$arguments += "semantic-connector"

& docker @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Could not start $Workers semantic worker(s)."
}

Write-Host "Started semantic-connector with $Workers worker replica(s)."
