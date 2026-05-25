# ENERSHARE Connector Template

This is a placeholder for a future real dataspace connector. The current project only provides a local dataspace-style export foundation.

Do not commit real ENERSHARE credentials.

## Future Environment Variables

```text
ENERSHARE_CONNECTOR_ENABLED=false
ENERSHARE_BASE_URL=
ENERSHARE_CLIENT_ID=
ENERSHARE_CLIENT_SECRET=
ENERSHARE_TOKEN_URL=
ENERSHARE_CATALOG_ID=
ENERSHARE_CONTRACT_POLICY_ID=
```

## Expected API Contract

- Publish catalog metadata for approved export assets.
- Support contract negotiation or policy checks before export.
- Export only minimized and pseudonymized payloads.
- Record every export and connector call in audit storage.

## Testing Approach

1. Continue testing `dataspace-export` locally.
2. Add a fake ENERSHARE connector mock.
3. Add sandbox connector credentials through secrets only.
4. Add production connector after security, legal, and privacy review.
