# Customer Dashboard User Journeys

## Household User

1. Sign in with a household-scoped account.
2. Open `/dashboard` to see current demand, daily energy, active devices, and
   the latest flexibility status.
3. Open Energy analytics to compare device contributions over a bounded
   period.
4. Open Connected devices to review simulated device state and recent event
   participation.
5. Open Flexibility to follow event progress. Approval controls remain hidden.
6. Open Community to see aggregate, anonymized information only.
7. Download or print a household-scoped report.

The household selector cannot be changed to another household.

## EnerShare Operator

1. Sign in with a community-scoped operator account.
2. Select a stable household pseudonym.
3. Review household energy and flexibility data without seeing another
   household's identity.
4. Review or decline an opportunity.
5. Approve a reviewed opportunity and prepare it for simulation.
6. Confirm the event timeline shows simulated completion only.
7. Generate household-scoped reports or review anonymized community totals.

## Technical Administrator

1. Use all customer routes for support and validation.
2. Open `/admin/operations` for the preserved engineering dashboard.
3. Access existing technical routes for infrastructure, semantic, protocol,
   security, and audit diagnostics.

Technical information is intentionally separated from normal customer routes.

## Failure Journey

If one backend capability is unavailable:

- the affected panel shows a safe error or empty state
- other product routes continue rendering
- no internal hostname, stack trace, secret, or raw payload is shown
- the user can retry a bounded request

