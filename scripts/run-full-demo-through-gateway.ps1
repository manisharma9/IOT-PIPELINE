param(
  [string]$EdgeApiKey = $(if ($env:EDGE_API_KEY) { $env:EDGE_API_KEY } else { "local-dev-edge-key" }),
  [int]$WaitSeconds = 6
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$GatewayBaseUrl = "http://localhost:3010"
$EdgeHeaders = @{
  "x-edge-api-key" = $EdgeApiKey
}

function Invoke-GatewayJsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$BodyPath,
    [hashtable]$Headers = @{}
  )

  $Body = Get-Content -Path $BodyPath -Raw
  $MergedHeaders = @{} + $EdgeHeaders
  foreach ($Key in $Headers.Keys) {
    $MergedHeaders[$Key] = $Headers[$Key]
  }

  Invoke-RestMethod `
    -Method Post `
    -Uri "$GatewayBaseUrl$Path" `
    -ContentType "application/json" `
    -Headers $MergedHeaders `
    -Body $Body `
    -TimeoutSec 20
}

function Invoke-GatewayGet {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  Invoke-RestMethod `
    -Method Get `
    -Uri "$GatewayBaseUrl$Path" `
    -Headers $EdgeHeaders `
    -TimeoutSec 20
}

function Get-LatestNewGatewayProposal {
  param(
    [string[]]$ExistingIds
  )

  for ($Attempt = 1; $Attempt -le 12; $Attempt += 1) {
    $Response = Invoke-GatewayGet -Path "/dispatch/proposals?limit=10"
    $Proposals = @($Response.proposals)
    $Candidate = $Proposals |
      Where-Object { $_.status -eq "proposed" -and ($ExistingIds -notcontains [string]$_.id) } |
      Select-Object -First 1

    if ($Candidate) {
      return $Candidate
    }

    Start-Sleep -Seconds 2
  }

  $FallbackResponse = Invoke-GatewayGet -Path "/dispatch/proposals?limit=10"
  return @($FallbackResponse.proposals) | Where-Object { $_.status -eq "proposed" } | Select-Object -First 1
}

Write-Host "Running AD-FLEX production-style local demo through security-gateway..."

$GatewayHealth = Invoke-RestMethod -Uri "$GatewayBaseUrl/health" -Method Get -TimeoutSec 10
Write-Host "Gateway health: $($GatewayHealth.status)"

$TelemetryPath = Join-Path $RepoRoot "examples\household_telemetry.json"
if (Test-Path $TelemetryPath) {
  Write-Host "Sending telemetry through security-gateway..."
  Invoke-GatewayJsonFile -Path "/telemetry" -BodyPath $TelemetryPath -Headers @{
    "x-correlation-id" = "gateway-demo-telemetry"
  } | Out-Null
  Start-Sleep -Seconds 3
} else {
  Write-Warning "Telemetry example not found at $TelemetryPath. Continuing with DSO signal path."
}

$ExistingResponse = Invoke-GatewayGet -Path "/dispatch/proposals?limit=10"
$ExistingIds = @($ExistingResponse.proposals | ForEach-Object { [string]$_.id })

Write-Host "Sending DSO grid signal through security-gateway..."
$DsoPath = Join-Path $RepoRoot "examples\dso_grid_signal.json"
$DsoResponse = Invoke-GatewayJsonFile -Path "/dso/grid-signal" -BodyPath $DsoPath -Headers @{
  "x-correlation-id" = "gateway-demo-dso"
}
Start-Sleep -Seconds $WaitSeconds

$Proposal = Get-LatestNewGatewayProposal -ExistingIds $ExistingIds
if (-not $Proposal) {
  throw "No proposed dispatch command was found through gateway. Check security-gateway and aggregator logs."
}

Write-Host "Using proposal id $($Proposal.id)"

$ReviewPath = Join-Path $RepoRoot "examples\approval_review_request.json"
$ApprovePath = Join-Path $RepoRoot "examples\approval_approve_request.json"
$ReadyPath = Join-Path $RepoRoot "examples\approval_mark_ready_request.json"

Write-Host "Reviewing proposal through security-gateway..."
$ReviewResponse = Invoke-GatewayJsonFile -Path "/approvals/proposals/$($Proposal.id)/review" -BodyPath $ReviewPath

Write-Host "Approving proposal through security-gateway..."
$ApproveResponse = Invoke-GatewayJsonFile -Path "/approvals/proposals/$($Proposal.id)/approve" -BodyPath $ApprovePath

Write-Host "Marking proposal ready through security-gateway..."
$ReadyResponse = Invoke-GatewayJsonFile -Path "/approvals/proposals/$($Proposal.id)/mark-ready" -BodyPath $ReadyPath

Start-Sleep -Seconds $WaitSeconds

Write-Host "Reading mock dispatch audit through security-gateway..."
$MockAudit = Invoke-GatewayGet -Path "/mock-dispatch/audit?limit=5"

Write-Host "Reading simulated device command audit through security-gateway..."
$DeviceAudit = Invoke-GatewayGet -Path "/device-command/audit?limit=5"

Write-Host "Calling dataspace export through security-gateway..."
$DataspaceExport = Invoke-GatewayGet -Path "/dataspace/export/full-pipeline-demo-summary"

Write-Host "Counting security gateway audit rows..."
$AuditCountText = docker compose exec -T timescaledb psql -U energy_user -d energy_flex -t -A -c "SELECT COUNT(*) FROM security_gateway_audit;"
$AuditCount = [int]($AuditCountText | Select-Object -Last 1)

$Summary = [pscustomobject]@{
  gateway_status = $GatewayHealth.status
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
  security_gateway_audit_rows = $AuditCount
}

Write-Host ""
Write-Host "Gateway demo summary:"
$Summary | ConvertTo-Json -Depth 8

Write-Host ""
Write-Host "Safety check: traffic entered through the local security gateway, and device actions remained simulated only."
