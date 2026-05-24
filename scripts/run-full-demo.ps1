param(
  [string]$ApiKey = $(if ($env:DATASPACE_API_KEY) { $env:DATASPACE_API_KEY } else { "local-dev-dataspace-key" }),
  [int]$WaitSeconds = 6
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

function Invoke-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Path,
    [hashtable]$Headers = @{}
  )

  $Body = Get-Content -Path $Path -Raw
  Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Headers $Headers -Body $Body -TimeoutSec 15
}

function Get-LatestNewProposal {
  param(
    [string[]]$ExistingIds
  )

  for ($Attempt = 1; $Attempt -le 12; $Attempt += 1) {
    $Response = Invoke-RestMethod -Uri "http://localhost:3003/dispatch/proposals?limit=10" -TimeoutSec 10
    $Proposals = @($Response.proposals)
    $Candidate = $Proposals |
      Where-Object { $_.status -eq "proposed" -and ($ExistingIds -notcontains [string]$_.id) } |
      Select-Object -First 1

    if ($Candidate) {
      return $Candidate
    }

    Start-Sleep -Seconds 2
  }

  $FallbackResponse = Invoke-RestMethod -Uri "http://localhost:3003/dispatch/proposals?limit=10" -TimeoutSec 10
  return @($FallbackResponse.proposals) | Where-Object { $_.status -eq "proposed" } | Select-Object -First 1
}

Write-Host "Running AD-FLEX full local demo sequence..."

$TelemetryPath = Join-Path $RepoRoot "examples\household_telemetry.json"
if (Test-Path $TelemetryPath) {
  Write-Host "Sending household telemetry..."
  Invoke-JsonFile -Uri "http://localhost:3001/telemetry" -Path $TelemetryPath | Out-Null
  Start-Sleep -Seconds 3
} else {
  Write-Warning "Telemetry example not found at $TelemetryPath. Continuing with DSO signal path."
}

$ExistingResponse = Invoke-RestMethod -Uri "http://localhost:3003/dispatch/proposals?limit=10" -TimeoutSec 10
$ExistingIds = @($ExistingResponse.proposals | ForEach-Object { [string]$_.id })

Write-Host "Sending DSO grid signal..."
$DsoPath = Join-Path $RepoRoot "examples\dso_grid_signal.json"
$DsoResponse = Invoke-JsonFile -Uri "http://localhost:3002/dso/grid-signal" -Path $DsoPath
Start-Sleep -Seconds $WaitSeconds

$Proposal = Get-LatestNewProposal -ExistingIds $ExistingIds
if (-not $Proposal) {
  throw "No proposed dispatch command was found. Check aggregator logs and grid.signals."
}

Write-Host "Using proposal id $($Proposal.id)"

$ReviewPath = Join-Path $RepoRoot "examples\approval_review_request.json"
$ApprovePath = Join-Path $RepoRoot "examples\approval_approve_request.json"
$ReadyPath = Join-Path $RepoRoot "examples\approval_mark_ready_request.json"

Write-Host "Reviewing proposal..."
$ReviewResponse = Invoke-JsonFile -Uri "http://localhost:3004/approvals/proposals/$($Proposal.id)/review" -Path $ReviewPath

Write-Host "Approving proposal..."
$ApproveResponse = Invoke-JsonFile -Uri "http://localhost:3004/approvals/proposals/$($Proposal.id)/approve" -Path $ApprovePath

Write-Host "Marking proposal ready for mock dispatch preparation..."
$ReadyResponse = Invoke-JsonFile -Uri "http://localhost:3004/approvals/proposals/$($Proposal.id)/mark-ready" -Path $ReadyPath

Start-Sleep -Seconds $WaitSeconds

Write-Host "Reading mock dispatch audit..."
$MockAudit = Invoke-RestMethod -Uri "http://localhost:3005/mock-dispatch/audit?limit=5" -TimeoutSec 10

Write-Host "Reading simulated device command audit..."
$DeviceAudit = Invoke-RestMethod -Uri "http://localhost:3009/device-command/audit?limit=5" -TimeoutSec 10

Write-Host "Calling dataspace full pipeline export..."
$ExportHeaders = @{ "x-api-key" = $ApiKey }
$DataspaceExport = Invoke-RestMethod `
  -Uri "http://localhost:3006/dataspace/export/full-pipeline-demo-summary" `
  -Headers $ExportHeaders `
  -TimeoutSec 20

$Summary = [pscustomobject]@{
  dso_status = $DsoResponse.status
  proposal_id = $Proposal.id
  review_status = $ReviewResponse.new_status
  approve_status = $ApproveResponse.new_status
  ready_status = $ReadyResponse.new_status
  mock_audit_rows = $MockAudit.count
  device_command_audit_rows = $DeviceAudit.count
  dataspace_export_type = $DataspaceExport.export_type
  dataspace_record_count = $DataspaceExport.record_count
  no_raw_private_payloads = $DataspaceExport.no_raw_private_payloads
}

Write-Host ""
Write-Host "Demo summary:"
$Summary | ConvertTo-Json -Depth 8

Write-Host ""
Write-Host "Safety check: this demo reaches mock dispatch and simulated device APIs only. No real household command was executed."
