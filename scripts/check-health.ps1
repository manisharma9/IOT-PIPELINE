$ErrorActionPreference = "Stop"

$Endpoints = @(
  @{ Name = "ingestion-api"; Url = "http://localhost:3001/health" },
  @{ Name = "ieee20305-translator"; Url = "http://localhost:3002/health" },
  @{ Name = "aggregator"; Url = "http://localhost:3003/health" },
  @{ Name = "approval-workflow"; Url = "http://localhost:3004/health" },
  @{ Name = "mock-dispatch-adapter"; Url = "http://localhost:3005/health" },
  @{ Name = "dataspace-export"; Url = "http://localhost:3006/health" },
  @{ Name = "shelly-simulator"; Url = "http://localhost:3007/health" },
  @{ Name = "enode-simulator"; Url = "http://localhost:3008/health" },
  @{ Name = "device-command-translator"; Url = "http://localhost:3009/health" }
)

$Results = foreach ($Endpoint in $Endpoints) {
  try {
    $Response = Invoke-RestMethod -Uri $Endpoint.Url -Method Get -TimeoutSec 8
    [pscustomobject]@{
      Service = $Endpoint.Name
      Url = $Endpoint.Url
      Healthy = $true
      Status = if ($Response.status) { $Response.status } else { "ok" }
      Detail = if ($Response.service) { $Response.service } else { "" }
    }
  } catch {
    [pscustomobject]@{
      Service = $Endpoint.Name
      Url = $Endpoint.Url
      Healthy = $false
      Status = "failed"
      Detail = $_.Exception.Message
    }
  }
}

$Results | Format-Table -AutoSize

if ($Results | Where-Object { -not $_.Healthy }) {
  Write-Error "One or more health checks failed."
}

Write-Host "All checked services responded."
