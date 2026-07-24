# EnerShare Customer Dashboard Implementation Report

## Overview

The previous customer console primarily served pipeline validation and
technical operations. This implementation preserves that capability while
adding a separate commercial product experience focused on household energy,
connected devices, flexibility participation, privacy-aware community
information, reports, and validated AI-powered insights.

## Product and Operations Separation

Customer product routes:

- `/dashboard`
- `/dashboard/analytics`
- `/dashboard/devices`
- `/dashboard/flexibility`
- `/dashboard/community`
- `/dashboard/reports`
- `/dashboard/settings`

Technical administrators retain the existing dashboard at:

- `/admin/operations`
- existing technical routes

Normal customer routes contain no streaming-topic, data-store, inference,
container, port, raw-payload, or model-debug diagnostics.

## Real Pipeline Data

The product read model uses:

- normalized device telemetry for current power and state
- cumulative meter readings and bounded sampled-power estimates for energy
- dispatch and approval records for event state
- mock execution and device-command records for simulated outcomes
- aggregate community queries for privacy-aware comparison

The UI labels direct measurements, estimates, and simulated outcomes
separately.

## Customer Read Layer

Migration `011_customer_dashboard_read_model.sql` adds source indexes, four
transparent SQL views, and the generated-insight cache. The security gateway
hosts the customer read-model modules and exposes authorized `/customer/*`
routes.

Next.js BFF routes forward signed-session scope and the server-only edge API
key. Browser components call `/api/customer/*` only.

## Access Control

- household users are forced to one household
- operators select stable household pseudonyms inside one community
- technical administrators can also access operations
- approval mutations are restricted to operators and technical
  administrators
- community comparisons are suppressed below five represented households

## AI-Powered Insights

The local model receives only bounded aggregate facts. It selects from an
allowlist of insight categories and cannot author free-form customer claims.
Deterministic validation verifies the selected fact and confidence, then
renders customer text from the supporting metric.

Insights are cached with an expiry time and refreshed hourly or through an
authorized action. The customer UI does not expose model identifiers,
prompts, request identifiers, latency, tokens, or raw reasoning.

## Unsupported Metrics

The product intentionally omits:

- financial savings and tariff optimization
- carbon emissions or avoided carbon
- physical export
- physically measured shifted energy
- real device availability or response
- certification claims

## File Inventory

### Backend and data

- `database/timescale/011_customer_dashboard_read_model.sql`
- `services/security-gateway/src/customer-auth.js`
- `services/security-gateway/src/customer-metrics.js`
- `services/security-gateway/src/customer-read-model.js`
- `services/security-gateway/src/customer-insights.js`
- customer routes in `services/security-gateway/src/index.js`

### Frontend

- product layout and seven customer routes under
  `apps/customer-console/src/app/(product)/dashboard`
- `apps/customer-console/src/components/product-shell.tsx`
- `apps/customer-console/src/components/product-ui.tsx`
- `apps/customer-console/src/components/energy-usage-chart.tsx`
- BFF routes under `apps/customer-console/src/app/api/customer`
- role/session and gateway helpers under `apps/customer-console/src/lib`
- `/admin/operations` bridge to the preserved `DashboardView`

### Tests

- customer authorization, metrics, insights, and gateway contract tests
- product terminology and BFF-boundary tests
- responsive desktop, tablet, and 320 px browser smoke script

## Run

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build

cd .\apps\customer-console
copy .env.example .env.local
npm.cmd install
npm.cmd run dev
```

Product URL: `http://localhost:3000/dashboard`

Operations URL: `http://localhost:3000/admin/operations`

## Safety

All device telemetry and command responses remain simulated.
`no_real_execution = true` remains the required workflow boundary. No physical
device-control endpoint or credential was added.

