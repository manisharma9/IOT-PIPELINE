# Public Demo Security

## Scope

This document describes the controls around the temporary laptop-hosted
customer demonstration. It is a local security boundary for a controlled
demo, not a production internet deployment.

## Exposed Surface

The only Cloudflare Quick Tunnel origin is:

```text
http://127.0.0.1:3000
```

That process is the Next.js customer console. The tunnel does not target:

- Kafka or Zookeeper;
- TimescaleDB/PostgreSQL;
- Ollama or an inference server;
- MQTT;
- security-gateway;
- ingestion, approval, dispatch, dataspace, or device translator ports;
- Shelly, Enode/Easee, heat-pump, or fleet simulator ports.

Docker-published ports bind to `127.0.0.1`, so they remain available for local
development but do not listen on the laptop's LAN interfaces.

## Public Route Allowlist

When `PUBLIC_DEMO_MODE=true`, Next.js permits:

- `/`
- `/login`
- `/dashboard/*`
- `/api/auth/*`
- `/api/dashboard/*`
- Next.js static assets

Other UI routes redirect to `/dashboard`. Other API routes return HTTP 404.
This keeps `/admin/operations` and legacy technical APIs outside the public
demonstration surface.

## Authentication

Credentials are supplied only through ignored environment files or process
environment:

- `DEMO_USERNAME`
- `DEMO_PASSWORD`
- `DEMO_SESSION_SECRET`

No credential is rendered on the login page. The login response does not
reveal whether a username exists. Repeated failures are throttled by client
address and return HTTP 429 after the configured limit.

Successful login creates an eight-hour HMAC-signed cookie with:

- `HttpOnly`;
- `SameSite=Lax`;
- `Secure` when the request arrives over Cloudflare HTTPS;
- path `/`.

The demo session is intentionally simple. It is not a substitute for OIDC,
MFA, centralized revocation, or a production identity provider.

## Same-Origin BFF

The browser calls only relative `/api/dashboard/*` paths. Next.js route
handlers:

1. verify the signed session;
2. enforce role permissions;
3. bound and validate query parameters;
4. attach customer scope and a correlation ID;
5. read `EDGE_API_KEY` server-side;
6. call `GATEWAY_BASE_URL`;
7. sanitize downstream failures.

The gateway key, gateway hostname, database settings, and internal Docker
hostnames are never included in customer JavaScript.

## Household Isolation

- `household_user` is pinned to its configured household.
- `enershare_operator` receives stable pseudonymous selectors for households
  in one authorized community.
- `technical_admin` remains a local technical role and is not the public
  demonstration account.

Every summary, inventory, detail, analytics, report, insight, and flexibility
query is re-scoped by the security gateway. A household cannot select another
household by changing a browser parameter.

## Customer Data Minimization

Customer responses contain product metrics rather than raw telemetry,
semantic prompts, Kafka details, internal ports, database rows, or raw audit
payloads. Device lists are paginated and detail histories are bounded.

Community data is aggregated and household identifiers are pseudonymized.
Dataspace output follows the existing minimization and pseudonymization
policy.

## Realtime Behavior

The product uses bounded polling at 30-60 second intervals. It does not use
Server-Sent Events, so Quick Tunnel's lack of SSE support does not affect the
current dashboard. Polling stops when the relevant component unmounts.

## Device Safety

Every current device is simulated. The registry and telemetry carry:

```text
simulated=true
no_real_execution=true
```

Approval, mock dispatch, and device API translation remain simulation-only.
No real Shelly, Enode, Easee, or heat-pump credentials are present.

## Validated Controls

The local validation confirmed:

- public login requires environment-configured credentials;
- the ninth invalid attempt returned HTTP 429 with an eight-attempt limit;
- public technical API access returned HTTP 404;
- `/admin/operations` redirected to the product dashboard;
- a cross-household read returned HTTP 403;
- public HTML exposed no loopback or internal Docker address;
- all Docker-published ports were loopback-bound;
- the temporary URL stopped responding after `cloudflared` stopped;
- mobile and tablet product views did not overflow horizontally.

## Residual Risks

- Quick Tunnel URLs are random, temporary, and have no availability SLA.
- Anyone with the URL can reach the login page.
- The login limiter is process-local and resets on dashboard restart.
- Demo sessions have no centralized revocation list.
- The laptop remains the availability boundary.
- Cloudflare Quick Tunnel is not a production ingress design.
- There is no production WAF policy, mTLS, OIDC, MFA, consent service, or
  managed secrets store.
- The public demonstration should be stopped immediately after use.

## Production Replacement

A production deployment should replace Quick Tunnel and demo auth with:

- managed HTTPS ingress and a controlled domain;
- WAF and distributed rate limiting;
- OIDC/JWT identity with MFA and lifecycle management;
- managed secrets;
- private service networking;
- service-to-service authentication;
- centralized audit and alerting;
- formal customer consent and data-retention policies.
