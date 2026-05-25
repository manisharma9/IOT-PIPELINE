$Headers = @{
  "x-edge-api-key" = "local-dev-edge-key"
  "x-correlation-id" = "gateway-telemetry-demo"
}

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/telemetry `
  -Headers $Headers `
  -ContentType application/json `
  -Body (Get-Content .\examples\household_telemetry.json -Raw)
