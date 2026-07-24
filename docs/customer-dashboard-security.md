# Customer Dashboard Security

## Trust Boundary

Customer browser requests call Next.js API routes only. The Next.js
backend-for-frontend attaches:

- the server-only edge API key
- correlation ID
- signed-session role
- signed-session household scope when present
- signed-session community scope

The security gateway applies its existing authentication, rate limit, IP
filter, request-inspection, content-type, body-size, and audit controls before
serving customer reads.

## Roles

- `household_user`: one required household
- `enershare_operator`: one community and pseudonymized household selection
- `technical_admin`: product plus technical operations access

Customer scope is checked in the Next.js BFF and again by the security
gateway customer authorization module. Cross-household requests return 403.

Approval mutations are allowed only for `enershare_operator` and
`technical_admin`. Household users are read-only.

## Data Isolation

- operator selectors contain stable pseudonyms
- real household identifiers are resolved server-side only
- community queries contain aggregates and suppress comparisons below five
  households
- reports apply the same household scope as on-screen reads
- customer insight prompts contain bounded aggregate facts only

## Error Handling

Customer responses do not include:

- stack traces
- internal service addresses
- SQL statements
- secrets
- raw request bodies
- model prompts or model audit fields

Correlation IDs remain available to support internal troubleshooting.

## Local Authentication Limitation

The current signed local session and shared edge API key are development
controls. Production deployment requires:

- managed OIDC/JWT identity
- short-lived tokens and key rotation
- explicit household/community claims
- hardened BFF-to-gateway service identity
- managed secrets
- production TLS and network controls
- customer consent and delegated operator authorization

## Safety Boundary

The dashboard adds no physical execution endpoint. Existing workflow results
must retain `no_real_execution = true`. Simulated commands are displayed as
simulation outcomes, never physical actions.

