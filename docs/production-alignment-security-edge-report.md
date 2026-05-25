# Production Alignment Security Edge Report

This report explains the local security edge and deployment-ready architecture alignment. It is not an AWS deployment and does not create cloud resources.

## What Was Added

- `security-gateway`, a local Node.js/Express edge service on port `3010`.
- API key protection with `x-edge-api-key`.
- JWT-ready middleware, disabled locally by default.
- Per-client IP rate limiting.
- IP allowlist and blocklist support.
- JSON content-type and request-size validation.
- DPI-style request inspection for obvious SQL injection, XSS, path traversal, and command injection patterns.
- Correlation ID generation and forwarding.
- Kafka audit topic: `security.gateway.audit`.
- TimescaleDB audit table: `security_gateway_audit`.
- Gateway-based full demo script.
- AWS deployment skeleton.
- Connector placeholder strategy for future ENERSHARE, Shelly, and Enode integrations.

## How It Matches The Architecture Diagram

The required production-style sequence is now represented locally:

```text
External clients / frontend / DSO / simulated devices
-> security-gateway
-> authentication
-> rate limiting
-> firewall/IP filtering
-> DPI-style request inspection
-> internal AD-FLEX services
-> existing event-driven pipeline
```

Direct internal ports are still exposed for local development, but the documented production-style path is through `http://localhost:3010`.

## Request Flow Through Gateway

Gateway route mapping:

| Gateway Route | Internal Target |
| --- | --- |
| `POST /telemetry` | `ingestion-api:3001/telemetry` |
| `POST /dso/grid-signal` | `ieee20305-translator:3002/dso/grid-signal` |
| `GET /dispatch/proposals` | `aggregator:3003/dispatch/proposals` |
| `/approvals/*` | `approval-workflow:3004` |
| `/mock-dispatch/*` | `mock-dispatch-adapter:3005` |
| `/dataspace/*` | `dataspace-export:3006` |
| `/device-command/*` | `device-command-translator:3009` |

Every accepted or blocked request gets an audit event. Raw request bodies are not stored. The gateway stores a request hash and safe metadata only.

## Security Controls Implemented Locally

- API key: `EDGE_API_KEY`, sent as `x-edge-api-key`.
- JWT-ready mode: `JWT_AUTH_ENABLED`, `JWT_ISSUER`, and `JWT_AUDIENCE`.
- Rate limit: `EDGE_RATE_LIMIT_WINDOW_MS` and `EDGE_RATE_LIMIT_MAX_REQUESTS`.
- IP filtering: `EDGE_IP_ALLOWLIST` and `EDGE_IP_BLOCKLIST`.
- Request body limit: `EDGE_REQUEST_BODY_LIMIT`.
- CORS: `CORS_ALLOWED_ORIGINS`.
- Audit topic: `SECURITY_GATEWAY_AUDIT_TOPIC`.

These controls are for local alignment and testing. Production should use managed cloud controls.

## AWS Deployment Mapping

| Local Feature | Future AWS Mapping |
| --- | --- |
| `security-gateway` | API Gateway + WAF + private service integration |
| `EDGE_API_KEY` | Secrets Manager and/or API Gateway usage plans |
| JWT-ready middleware | Cognito or API Gateway JWT authorizer |
| Rate limiting | API Gateway throttling and WAF rate-based rules |
| IP filtering | WAF IP sets |
| DPI-style rules | WAF managed rule groups and custom rules |
| TLS/mTLS | ACM certificate and API Gateway custom domain mTLS |
| Node services | ECS/Fargate |
| Kafka | Amazon MSK or managed/self-hosted Kafka |
| MQTT | AWS IoT Core or broker container |
| TimescaleDB | Managed Timescale/Postgres or self-hosted staging |
| Frontend | CloudFront/S3 or Amplify calling API Gateway only |

The skeleton is under `infra/aws/`. No AWS resources are created by this sprint.

## Connector Placeholder Strategy

The `connectors/` folder documents future integration points:

- ENERSHARE / dataspace connector
- Shelly device provider connector
- Enode / Easee Core provider connector

Real credentials must be loaded through environment variables and secret storage later. They must not be committed.

## Frontend Integration Path

A future frontend should call only:

```text
http://localhost:3010
```

in local development, and AWS API Gateway in production. It should not call internal service ports directly except during developer debugging.

## How To Run Locally

```powershell
cd C:\Users\Mani\Desktop\Github\IOT-PIPELINE
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1 -Build
powershell -ExecutionPolicy Bypass -File .\scripts\check-health.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-full-demo-through-gateway.ps1
```

## How To Test Security Behavior

Missing API key:

```powershell
Invoke-RestMethod http://localhost:3010/dispatch/proposals
```

Valid API key:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3010/dispatch/proposals `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" }
```

Blocked payload:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3010/telemetry `
  -Headers @{ "x-edge-api-key" = "local-dev-edge-key" } `
  -ContentType application/json `
  -Body (Get-Content .\examples\security_blocked_payload.json -Raw)
```

Check audit rows:

```powershell
docker compose exec -T timescaledb psql -U energy_user -d energy_flex -c "SELECT decision, reason, status_code, route FROM security_gateway_audit ORDER BY created_at DESC LIMIT 10;"
```

## Details Needed Later

- AWS account and deployment role.
- Domain names and TLS certificates.
- Identity provider and JWT issuer/audience.
- WAF production rule choices.
- Secrets Manager names and rotation policy.
- Real connector credentials for ENERSHARE, Shelly, and Enode.
- Consent model and real-device safety controls.
- Production database, Kafka, MQTT, logging, backup, and monitoring decisions.

## Safety Statement

This sprint adds local security-edge alignment only. It does not deploy to AWS, does not require AWS credentials, does not add real connector credentials, and does not control real household devices.
