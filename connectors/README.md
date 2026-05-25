# Connector Placeholder Strategy

This folder documents where real external connector details will be added later. It does not contain real credentials and does not enable real external integrations.

Current rule:

- Use simulators first.
- Do not commit credentials.
- Do not control real household devices until a consent, identity, and safety model exists.

Future connector configuration should use environment variables, AWS Secrets Manager, or another approved secret store.

## Future Credential Areas

| Connector | Future Credential Source | Current Local Replacement |
| --- | --- | --- |
| ENERSHARE / dataspace connector | Secrets Manager or deployment secret | `dataspace-export` local foundation |
| Shelly device provider | Secrets Manager or deployment secret | `shelly-simulator` |
| Enode / Easee Core provider | Secrets Manager or deployment secret | `enode-simulator` |

## Expected Practice

1. Add provider-specific environment variables to `.env.example` with empty placeholder values only.
2. Load real values from secret storage in deployment.
3. Keep simulator tests as the first verification layer.
4. Add sandbox provider tests before any production device integration.
5. Require explicit consent and safety review before real control.
