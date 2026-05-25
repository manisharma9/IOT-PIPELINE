# API Gateway Module Placeholder

Future purpose:

- Expose the public AD-FLEX API entry point.
- Route frontend, DSO, telemetry, approval, dataspace, and audit calls to private services.
- Attach API usage plans or authorizers.
- Forward correlation IDs.

Local mapping:

- `services/security-gateway`

Credentials needed later:

- AWS deployment role
- ACM certificate details
- Optional mTLS truststore
- API usage plan or identity provider details
