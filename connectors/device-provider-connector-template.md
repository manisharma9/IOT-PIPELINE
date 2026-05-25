# Device Provider Connector Template

This is a placeholder for future real Shelly and Enode / Easee Core integrations. Current device behavior is simulated only.

Do not commit real Shelly, Enode, Easee, customer, or household credentials.

## Future Shelly Environment Variables

```text
SHELLY_CONNECTOR_ENABLED=false
SHELLY_API_BASE_URL=
SHELLY_CLIENT_ID=
SHELLY_CLIENT_SECRET=
SHELLY_DEVICE_REGISTRY_SOURCE=
```

## Future Enode / Easee Environment Variables

```text
ENODE_CONNECTOR_ENABLED=false
ENODE_API_BASE_URL=
ENODE_CLIENT_ID=
ENODE_CLIENT_SECRET=
ENODE_WEBHOOK_SECRET=
ENODE_CHARGER_REGISTRY_SOURCE=
```

## Expected API Contract

- Accept an approved `dispatch.command.ready` style event.
- Verify consent and device availability.
- Translate the command into provider-specific API calls.
- Return provider response metadata.
- Store audit rows without raw secrets or private payloads.

## Testing Approach

1. Use `shelly-simulator` and `enode-simulator` first.
2. Add provider sandbox tests.
3. Add consent and authorization checks.
4. Add production provider credentials only through secret storage.
5. Keep a kill switch and no-real-execution mode available.
