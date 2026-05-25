$Headers = @{
  "x-edge-api-key" = "local-dev-edge-key"
  "x-correlation-id" = "gateway-dso-demo"
}

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/dso/grid-signal `
  -Headers $Headers `
  -ContentType application/json `
  -Body (Get-Content .\examples\dso_grid_signal.json -Raw)
