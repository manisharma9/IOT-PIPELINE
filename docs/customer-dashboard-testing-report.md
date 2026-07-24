# EnerShare Customer Dashboard Testing Report

## Validation Summary

Validation was completed on 24 July 2026 against the local Docker Compose
platform and local Phi-3 Mini runtime. The customer dashboard passed its
build, access-boundary, responsive, and live-data checks. The existing
telemetry, flexibility, mock dispatch, device translation, dataspace, and
security-gateway workflow also remained operational.

No physical device command was enabled. The final gateway demo retained the
`no_real_execution = true` safety boundary.

## Automated Test Results

| Validation | Result |
| --- | --- |
| Service Node tests | 184 passed, 0 failed |
| Root scalability/generator tests | 5 passed, 0 failed |
| Customer product-boundary tests | 4 passed, 0 failed |
| Security-gateway tests | 39 passed, 0 failed |
| Semantic-connector tests | 41 passed, 0 failed |
| Customer console lint | Passed |
| Customer console production build | Passed, 54 routes generated |
| Client boundary scan | Passed |
| PowerShell syntax parsing | 12 scripts passed |
| `docker compose config` | Passed |
| `docker compose config --services` | 18 services |

The `mqtt-subscriber` package has no Node test script, so it was not counted
as an automated unit suite. Its container remained part of the validated
Compose topology.

## Access and Privacy Tests

The following controls passed:

- a household user cannot request a different household
- an operator receives stable pseudonyms rather than source household IDs
- a pseudonym resolves only inside the authorized community
- approval mutations require operator or technical-administrator access
- an operator is redirected away from `/admin/operations`
- a technical administrator can open `/admin/operations`
- browser code calls Next.js `/api/*` routes only
- the edge API key is absent from client components and client bundles
- community comparisons suppress household identifiers
- customer pages contain no raw pipeline, database, model-debug, or
  container terminology

## Live Customer Read Validation

A dedicated household was sent through the security gateway with current,
realistic simulated readings from:

- one Shelly Plug
- one Enode / Easee EV charger
- one heat pump

The customer read layer returned:

| Evidence | Observed result |
| --- | --- |
| Authorized pseudonymized households | 64 |
| Selected household devices | 3 |
| Live household power | 6.19 kW |
| Daily energy | 1.55 kWh, estimated from sampled power |
| Analytics points | 1 bounded 15-minute point |
| Simulation flag | `true` |
| No-real-execution flag | `true` |

These values came from `normalized_telemetry` through the SQL read views and
the authorized security-gateway customer API. They were not hardcoded in the
dashboard.

## Semantic and Insight Validation

The current semantic connector submitted every fresh validation reading to
the local SLM. The durable semantic audit recorded `slm_called = true` for
all 13 reading attempts.

- 7 readings were accepted as `slm_primary`
- 6 readings were recorded as `safely_unmapped`
- no deterministic replacement mapping was fabricated
- safely-unmapped reasons included missing model mappings and one invalid
  unit relationship

This is expected guardrail behavior for the mandatory-SLM architecture. The
customer energy read model remains based on validated normalized telemetry,
while customer insight copy is generated separately from bounded aggregates.

The live customer-insight path:

1. supplied only aggregate, allowlisted facts to local Phi-3 Mini
2. restricted model output to insight-key selection and confidence
3. rejected unavailable or unsupported fact selections
4. rendered numerical copy only from server-verified supporting metrics
5. persisted the validated insight with an expiry time

The final live result was:

> The highest observed demand in this period was 6.19 kW around 24 Jul,
> 14:00 UTC.

The customer response did not expose a prompt, model identifier, batch ID,
latency, token count, or raw reasoning.

## Live Pipeline Validation

`scripts/check-health.ps1` reported all 11 checked HTTP services healthy.

`scripts/run-full-demo-through-gateway.ps1` completed with:

| Stage | Result |
| --- | --- |
| Gateway | `ok` |
| DSO request | `accepted` |
| Proposal | ID `97` |
| Review | `reviewed` |
| Approval | `approved` |
| Ready state | `ready_to_dispatch` |
| Mock audit read | 5 rows |
| Device-command audit read | 5 rows |
| Dataspace export | `full_pipeline_demo_summary` |
| Export record count | 100 |
| Raw private payloads | Not exposed |
| Security audit rows | 1,762 |

All device actions remained simulated.

## Browser and Responsive Validation

Playwright visited every customer product route at desktop size:

- `/dashboard`
- `/dashboard/analytics`
- `/dashboard/devices`
- `/dashboard/flexibility`
- `/dashboard/community`
- `/dashboard/reports`
- `/dashboard/settings`

The overview was also checked at 768 px tablet width and 320 px mobile
width. Both deterministic-fixture and live-data modes passed.

Checks confirmed:

- no horizontal overflow
- explicit empty-data and API-error states render without a page crash
- primary headings and accessible names are present on interactive buttons
- keyboard-operable native controls
- no crash when data is missing
- no engineering-only terminology in the customer page body
- the simulation warning remains visible

Final live screenshots:

- `docs/demo-assets/customer-dashboard-desktop.png`
- `docs/demo-assets/customer-dashboard-tablet.png`
- `docs/demo-assets/customer-dashboard-mobile.png`

## Known Warnings and Limitations

- Docker Compose prints an existing warning that the top-level `version`
  attribute is obsolete. Configuration still parses successfully.
- Daily energy may be estimated when fewer than two cumulative meter samples
  exist.
- Physical shifted energy, tariff savings, carbon reduction, and actual
  export remain unavailable because the repository has no supporting
  production data.
- SLM output can be safely unmapped when strict semantic validation fails.
  The UI does not convert those failures into invented semantic claims.
- Authentication is a signed local demonstration session, not a production
  identity provider.
- Simulated devices are not physical household equipment.

## Conclusion

The new customer dashboard is ready for the local client demonstration. It
uses live pipeline data through the approved BFF and security gateway,
preserves household isolation, clearly identifies estimates and simulated
outcomes, and leaves the engineering dashboard available to technical
administrators at `/admin/operations`.
