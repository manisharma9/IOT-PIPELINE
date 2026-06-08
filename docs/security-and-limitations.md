# Security And Limitations

This repository is a local development foundation for a production-style DSO communication pipeline. It is not a production smart-grid control system.

## Local Development Only

The Docker Compose setup, local API key, Kafka settings, and database credentials are designed for the local demo environment.

Production deployment would require hardened infrastructure, managed secrets, network controls, identity, and operational monitoring.

## Local Security Gateway Is Not Production Security

The `security-gateway` service is a local production-style edge. It gives the environment the same sequence expected in production:

```text
external client -> security-gateway -> authentication -> rate limiting -> IP filtering -> DPI-style inspection -> internal services
```

It implements local API key validation, JWT-ready middleware, rate limiting, IP allow/block lists, content-type checks, request-size limits, correlation IDs, and audit logging. This is still local development security only.

In production, this layer should be replaced or fronted by AWS API Gateway, AWS WAF, managed TLS/mTLS, a real identity provider, and managed secrets.

Direct internal service ports are kept for local development and debugging. A frontend or external client should use the gateway locally and AWS API Gateway later.

Gateway decisions are audited to `security_gateway_audit` and `security.gateway.audit`. The gateway stores safe metadata and a request hash, not raw request bodies.

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

The security gateway uses `x-edge-api-key` as a local edge protection mechanism. This is also not enough for production.

Production export would need stronger authentication, authorization, scoped access, rate limiting, and key/secret rotation.

## No Real Household Device Control

The pipeline does not control real household devices. It does not send commands to EV chargers, batteries, inverters, appliances, or smart meters.

The device API translation layer is also simulated. It does not use real Shelly credentials, real Enode credentials, real Easee Core charger credentials, or real heat pump credentials.

## Mock Dispatch Only

Phase 7 is mock dispatch only. It creates simulated command and result events. Every mock event must state:

- `simulated: true`
- `no_real_execution: true`
- `execution_mode: mock`

## Simulated Device API Translation Only

The Shelly Plug, Enode / Easee Core, and Heat Pump services are local simulators. The device command translator can convert an approved ready dispatch command into simulated device-specific API calls, but it never reaches a real customer device.

Every simulated device API command must state:

- `simulated: true`
- `no_real_execution: true`
- `execution_mode: simulated_device_api`

## Not Certified IEEE 2030.5

The IEEE 2030.5 translator creates simplified IEEE 2030.5-style payloads using concepts such as `MirrorMeter`, `MirrorMeterReading`, `DERStatus`, and DSO-facing gateway context. It is not certified and does not implement the full standard.

Production would require a standards-compliant stack, security profile, conformance testing, and interoperability validation.

## Not Certified ENERSHARE Connector

The dataspace export service is an IDS/ENERSHARE-ready export foundation. It is not a certified ENERSHARE connector and does not implement real EDC connector credentials, connector runtime, contract negotiation, or production dataspace publication.

## Raw Household Data Is Not Exported In Phase 8

Phase 8 exports summary data only. It applies minimization and pseudonymization:

- raw telemetry payloads are not returned
- source payload JSON is not returned
- household IDs are pseudonymized
- device IDs are pseudonymized
- community ID remains visible as a community-level grouping

This is a local privacy boundary, not a full privacy compliance program.

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

AD-FLEX demonstrates a controlled pipeline for energy flexibility decision support. It is safe for the local demo environment because it stops at audited mock dispatch and does not execute real household commands.
