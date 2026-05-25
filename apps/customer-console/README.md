# Customer Operator Console

The Customer Operator Console is the front-facing web application for the Smart Grid Communication Pipeline. It is a Next.js and TypeScript dashboard for local operation today, with a structure suitable for later Vercel deployment and connection to an AWS-hosted backend.

## Purpose

- Give operators a polished view of telemetry, semantic mapping, DSO load management, dispatch proposals, safe mock dispatch, simulated device API translation, dataspace export, and AWS readiness.
- Keep browser traffic away from internal backend ports.
- Prove the production-style access pattern: browser -> Next.js API routes -> security gateway -> internal AD-FLEX services.
- Keep all real execution disabled. Shelly Plug and Enode / Easee Core integrations remain simulated.

## Pages

- Login
- Executive Overview
- Architecture Flow
- Security Gateway
- Telemetry Simulator
- Semantic Mapping
- IEEE 2030.5 Translation
- DSO Load Management
- Dispatch Proposals
- Mock Dispatch
- Device Command Translation
- Dataspace Export
- AWS Readiness
- Documentation / Runbook

## Local Setup

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build

cd .\apps\customer-console
copy .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Default local credentials:

```text
operator / operator123
```

## Environment Variables

```text
NEXT_PUBLIC_APP_NAME=Smart Grid Communication Console
GATEWAY_BASE_URL=http://localhost:3010
EDGE_API_KEY=local-dev-edge-key
DEMO_AUTH_USERNAME=operator
DEMO_AUTH_PASSWORD=operator123
NEXT_PUBLIC_DEPLOYMENT_MODE=local
```

`EDGE_API_KEY` is used only by Next.js server API routes. It must not be referenced by browser components.

## Local Authentication

The console uses demo operator credentials from environment variables and stores a signed HttpOnly session cookie. This is suitable for local testing only.

Production authentication can later be connected to Cognito, Auth0, or another JWT issuer. The security gateway already has JWT-ready structure for that future connection.

## Gateway Proxy Model

Browser code calls only `/api/*` routes inside this Next.js app. Those server-side routes call `GATEWAY_BASE_URL` and attach `x-edge-api-key` from `EDGE_API_KEY`.

The browser must not call internal service ports directly:

- 3001 ingestion API
- 3002 IEEE 2030.5 translator
- 3003 aggregator
- 3004 approval workflow
- 3005 mock dispatch adapter
- 3006 dataspace export
- 3009 device command translator

## Vercel Deployment Notes

For Vercel, configure environment variables in the project settings:

- `GATEWAY_BASE_URL` should point to the AWS API Gateway or security gateway URL.
- `EDGE_API_KEY` should be stored as a server-side secret.
- `DEMO_AUTH_USERNAME` and `DEMO_AUTH_PASSWORD` should be replaced by production identity integration.
- `NEXT_PUBLIC_DEPLOYMENT_MODE` can become `staging` or `production`.

## AWS Connection Notes

The local security gateway maps to a future AWS API Gateway and WAF edge. The console should continue calling its own Next.js API routes. Those routes can later call the AWS-hosted gateway without changing browser code.

## Safety Boundaries

- No real household command execution.
- No real Shelly credentials.
- No real Enode or Easee credentials.
- No certified IEEE 2030.5 claim.
- No certified ENERSHARE claim.
- Safe mock dispatch and simulated device API translation only.
