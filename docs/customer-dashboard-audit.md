# Customer Dashboard Audit

## Audit Scope

This audit covers the existing Next.js customer console, its server-side API
routes, security-gateway reads, TimescaleDB schema, simulated device telemetry,
authentication foundation, responsive behavior, and current test coverage.

The audit was completed before changing dashboard behavior.

## Current Frontend

The frontend is a standalone Next.js 16 App Router application at
`apps/customer-console`.

Current stack:

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- Lucide icons
- Recharts
- signed HttpOnly local session cookie
- server-side Next.js API routes
- security-gateway-only backend access

The application already has a responsive left navigation, mobile drawer,
cards, badges, charts, tables, JSON viewers, loading states, and empty states.
Most page rendering is concentrated in
`apps/customer-console/src/components/dashboard-view.tsx`.

## Current Route Inventory

The existing routes are technical and operational:

| Route | Current purpose | Product decision |
| --- | --- | --- |
| `/overview` | Full pipeline status | Retain for technical administrators |
| `/scalability` | SLM and Kafka scale metrics | Retain for technical administrators |
| `/architecture` | Internal pipeline components | Retain for technical administrators |
| `/security` | Security audit and blocked-request test | Retain for technical administrators |
| `/telemetry` | Raw telemetry submission tool | Retain for technical administrators |
| `/semantic` | Semantic mapping diagnostics | Retain for technical administrators |
| `/ieee20305` | Protocol translation diagnostics | Retain for technical administrators |
| `/dso` | Technical DSO request form | Retain for technical administrators |
| `/dispatch` | Proposal and approval controls | Reuse through a customer-friendly flexibility view |
| `/mock-dispatch` | Mock execution audit | Retain for technical administrators |
| `/device-command` | Device API audit | Retain for technical administrators |
| `/dataspace` | Raw export payload view | Retain for technical administrators |
| `/aws-readiness` | Deployment checklist | Retain for technical administrators |
| `/runbook` | Technical runbook | Retain for technical administrators |

The product route hierarchy will be:

- `/dashboard`
- `/dashboard/analytics`
- `/dashboard/devices`
- `/dashboard/flexibility`
- `/dashboard/community`
- `/dashboard/reports`
- `/dashboard/settings`
- `/admin/operations`

The existing technical routes remain available to `technical_admin` so
existing validation links and scripts keep working.

## Existing Components That Can Be Reused

- signed session-cookie primitives in `src/lib/auth.ts`
- gateway-only server request helper in `src/lib/gateway.ts`
- Lucide icon dependency
- Recharts dependency
- accessible button and badge patterns
- responsive mobile navigation pattern
- existing technical `DashboardView`
- existing gateway audit infrastructure
- existing dispatch and approval APIs
- existing dataspace privacy principles

The visual styling and product components need a dedicated design system
rather than extending the technical monolith.

## Engineering-Only Components

The following content must not appear in normal customer routes:

- Kafka topic names or consumer lag
- Docker and internal service health
- database table and row counts
- SLM provider, model, prompt, batch, request, latency, or audit identifiers
- raw semantic fields and mapping diagnostics
- internal ports and hostnames
- raw JSON viewers
- raw security audit rows
- raw IEEE 2030.5-style payloads
- device command payloads
- dataspace payload JSON
- validation and load-test controls

These remain under the technical administrator experience.

## Available Data

### Household and device identity

`raw_telemetry`, `normalized_telemetry`, `semantic_events`, and
`ieee20305_events` contain:

- `community_id`
- `household_id`
- `device_id`
- `device_type`
- event and processing timestamps

### Energy and device state

`normalized_telemetry` supports real pipeline readings from the simulators:

- Shelly Plug: `active_power_kw`, `voltage_v`, `current_a`,
  `energy_import_kwh`
- Enode / Easee: `ev_charging_power_kw`, `energy_delivered_kwh`,
  `charging_state_code`
- Heat Pump: `heat_pump_power_kw`, `indoor_temperature_c`,
  `target_temperature_c`, `flow_temperature_c`, `operating_mode_code`

Power is directly measured by the simulator. Cumulative energy is available
for Shelly and EV readings. Heat-pump energy must be identified as an estimate
derived from sampled power.

### Flexibility workflow

`dispatch_commands`, `dispatch_approval_audit`,
`dispatch_execution_audit`, and `device_command_audit` provide:

- requested and proposed actions
- target reduction in kW
- event start and end times
- proposal and approval status
- mock dispatch status
- per-device allocated reduction
- simulated device response status
- `no_real_execution`

### Community and privacy

Community identifiers are available. Household comparisons can be generated
from aggregate queries. Raw household identifiers must not be returned in
community rankings or peer datasets.

## Metrics Supported Without Fabrication

- latest household power
- device power contribution
- latest device state
- device last seen and data freshness
- cumulative-meter energy delta where available
- estimated heat-pump energy from bounded power samples
- eligible flexible device count
- estimated available flexible load
- active grid-event status
- requested and allocated reduction
- proposal, approval, mock dispatch, and simulated device-command status
- simulated shifted-energy estimate from allocated kW and event duration
- anonymized community demand and distribution

## Metrics Requiring New Aggregation

- household power series for 24 hours, 7 days, and 30 days
- device contribution by time bucket
- energy used today
- per-device daily energy
- household latest summary
- flexibility history with a customer-friendly timeline
- anonymized community percentile
- report summaries
- validated, cached customer insights
- flexibility score component data

These will be calculated server-side with bounded date ranges and pagination.

## Metrics Not Currently Supported

The product must not claim the following without new external data:

- financial savings or cost
- tariff optimization
- carbon emissions or carbon savings
- renewable generation or grid export
- battery state unless matching telemetry exists
- measured energy shifted by a physical device
- real device availability
- real household occupancy
- certified IEEE 2030.5 behavior
- certified ENERSHARE or IDS exchange

Cards that depend on these values will be omitted or labelled unavailable.

## Current Authentication and Access Risk

The current session contains only a username. It does not contain a role,
household scope, community scope, expiry timestamp, or authorization claims.
The proxy checks for cookie presence, while protected layouts and API routes
verify the signed cookie.

Required changes:

- add `household_user`, `enershare_operator`, and `technical_admin` roles
- bind household and community scope into the signed session
- enforce authorization in every customer server route
- enforce the same scope again at the security gateway
- restrict technical routes to `technical_admin`
- expire sessions and reject malformed roles

The proxy remains a convenience redirect, not the sole authorization gate.

## Privacy Risks

- The existing `/platform/devices` endpoint returns raw household and device
  identifiers and therefore cannot be used by the product dashboard.
- The existing technical dashboard can expose multiple households and must be
  restricted to technical administrators.
- Operator household lists must use stable pseudonyms.
- Community comparisons must return aggregates only and suppress small groups.
- Insight generation must use aggregated facts and must not persist prompts.
- CSV reports must apply the same household authorization as on-screen views.

## Responsive and Accessibility Audit

The current application has a mobile drawer and responsive grids. It does not
yet provide:

- a product-specific 320 px layout check
- route-level loading and error boundaries
- accessible chart summaries
- reduced-motion styling
- automated WCAG checks
- product screenshot regression tests

These are required for the new product routes.

## Existing Test Coverage

Current frontend validation covers:

- lint and production build
- browser-to-BFF boundary checks
- a multi-household overview smoke test
- MP4 walkthrough automation

Missing coverage:

- metric calculations
- customer API contracts
- role authorization
- household isolation
- aggregate query behavior
- insight validation
- product terminology boundaries
- empty and error states
- responsive product routes
- accessibility checks

## Architecture Decision

The minimum reliable read architecture is:

1. TimescaleDB views and indexes for bounded household aggregation.
2. A customer read-model module inside `security-gateway`.
3. Authorized `/customer/*` gateway endpoints.
4. Next.js BFF routes that attach signed-session scope server-side.
5. Product pages that call only the Next.js BFF.

This avoids a new microservice, keeps secrets server-side, preserves the
gateway as the external security boundary, and prevents browser access to raw
pipeline services or tables.

## Audit Conclusion

The repository contains enough real simulated pipeline data to build a
credible household energy and flexibility product. The product must clearly
separate direct measurements, derived estimates, simulated outcomes, and
unavailable metrics. The current technical dashboard should be preserved, not
relabelled as a customer product.
