# Security And Limitations

This project is a local development and final demo foundation. It is not a production smart-grid control system.

## Local Development Only

The Docker Compose setup, local API key, Kafka settings, and database credentials are designed for local demonstration.

Production deployment would require hardened infrastructure, managed secrets, network controls, identity, and operational monitoring.

## No Production mTLS Yet

The services do not implement production mutual TLS. For production, service-to-service and external API traffic would need certificate management, rotation, validation, and clear trust boundaries.

## No Real OAuth/OIDC Identity Provider Yet

The approval workflow uses request payload reviewer fields for demo purposes. It does not integrate with a production identity provider.

Production approval would need:

- OAuth/OIDC login
- role-based access control
- reviewer identity verification
- tamper-resistant audit trails

## API Key Is Local Development Only

The dataspace export service uses `x-api-key` as a simple local protection mechanism. This is not enough for production.

Production export would need stronger authentication, authorization, scoped access, rate limiting, and key/secret rotation.

## No Real Household Device Control

The pipeline does not control real household devices. It does not send commands to EV chargers, batteries, inverters, appliances, or smart meters.

The scope alignment device translation path is also simulated. It does not use real Shelly credentials, real Enode credentials, or real Easee Core charger credentials.

## Mock Dispatch Only

Phase 7 is mock dispatch only. It creates simulated command and result events. Every mock event must state:

- `simulated: true`
- `no_real_execution: true`
- `execution_mode: mock`

## Simulated Device API Translation Only

The Shelly Plug and Enode / Easee Core services are local simulators. The device command translator can convert an approved ready dispatch command into simulated device-specific API calls, but it never reaches a real customer device.

Every simulated device API command must state:

- `simulated: true`
- `no_real_execution: true`
- `execution_mode: simulated_device_api`

## Not Certified IEEE 2030.5

The IEEE 2030.5 translator creates simplified IEEE 2030.5-style payloads for learning and demo purposes. It is not certified and does not implement the full standard.

Production would require a standards-compliant stack, security profile, conformance testing, and interoperability validation.

## Not Certified ENERSHARE Connector

The dataspace export service is a dataspace-style foundation. It is not a certified ENERSHARE connector and does not implement real EDC connector credentials, contract negotiation, or production dataspace publication.

## Raw Household Data Is Not Exported In Phase 8

Phase 8 exports summary data only. It applies minimization and pseudonymization:

- raw telemetry payloads are not returned
- source payload JSON is not returned
- household IDs are pseudonymized
- device IDs are pseudonymized
- community ID remains visible as a community-level grouping

This is a demo privacy boundary, not a full privacy compliance program.

## What Would Be Needed For Production

Production readiness would require:

- production identity and access management
- mTLS or equivalent service-to-service security
- managed secrets
- signed audit logs
- rate limiting and request validation hardening
- contract-based dataspace access
- certified protocol implementations where required
- real device consent and enrollment
- customer privacy impact assessment
- monitoring, alerting, backups, and disaster recovery
- explicit operator approval workflows
- security testing and penetration testing

## Final Safety Statement

AD-FLEX demonstrates a controlled pipeline for energy flexibility decision support. It is safe for local demo because it stops at audited mock dispatch and does not execute real household commands.
