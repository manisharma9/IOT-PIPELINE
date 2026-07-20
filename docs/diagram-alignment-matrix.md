# Diagram Alignment Matrix

This matrix maps the final architecture diagram components to the local repository and the future AWS production shape.

| Diagram Component | Local Implementation | Repo Location | AWS Production Mapping | Current Status | Details Needed Later |
| --- | --- | --- | --- | --- | --- |
| Communities and households | Example household telemetry and simulated devices | `examples/`, `services/shelly-simulator`, `services/enode-simulator`, `services/heat-pump-simulator` | Real enrolled customers/devices | Simulated | Consent model, enrollment, identity |
| HTTP telemetry | Gateway to ingestion API, including `/telemetry` and `/api/ingest` compatibility alias | `services/security-gateway`, `services/ingestion-api` | API Gateway to private service | Local-ready | API domain, auth model |
| MQTT telemetry | MQTT broker and subscriber | `services/mqtt-broker`, `services/mqtt-subscriber` | AWS IoT Core or managed broker | Local-ready | Device certificates, topic policy |
| AWS API Gateway | Local security gateway | `services/security-gateway` | API Gateway | Skeleton-ready | Domain, authorizer, private integration |
| Rate limiting | In-memory edge rate limiter | `services/security-gateway/src/security.js` | API Gateway throttling and WAF rate-based rules | Local-ready | Production limits |
| Authentication | `x-edge-api-key`, JWT-ready disabled mode | `services/security-gateway/src/security.js` | Cognito or JWT authorizer, usage plans | Local foundation | Issuer, audience, identity provider |
| SSL/TLS | Documented only | `infra/aws/README.md` | ACM and API Gateway custom domain | Future work | Certificates and domains |
| Firewall | Local route/method controls | `services/security-gateway` | WAF and security groups | Local foundation | VPC/network policy |
| IP filtering | Gateway allowlist/blocklist env vars | `services/security-gateway/src/security.js` | WAF IP sets | Local-ready | Real allow/block ranges |
| DPI rules | Local SQLi/XSS/path traversal/command inspection | `services/security-gateway/src/security.js` | WAF managed and custom rules | Local-ready | Production rule tuning |
| Express API | Node.js services | `services/*` | ECS/Fargate containers | Local-ready | Image registry and task definitions |
| MQTT broker | Mosquitto container | `services/mqtt-broker` | AWS IoT Core or broker container | Local-ready | Production MQTT choice |
| Apache Kafka | Kafka container | `docker-compose.yml` | Amazon MSK or managed/self-hosted Kafka | Local-ready | Cluster sizing and auth |
| Engine | Normalization service | `services/engine` | ECS/Fargate service | Complete locally | Production scaling |
| SLM semantic connector | Mandatory reading-level inference through Ollama or a vLLM-compatible provider | `services/semantic-connector` | ECS/Fargate workers plus private GPU model endpoint | Complete locally; high-scale capacity not validated | Production model hosting and GPU profile |
| SAREF4ENER | Deterministic post-inference validation, rejection, and retry guidance | `services/semantic-connector/src/saref4ener-mapping.js` | Same service/library | Complete locally | Vocabulary governance |
| PostgreSQL/Timescale hypertables | TimescaleDB container and migrations | `database/timescale` | Managed Timescale/Postgres or staging DB | Local-ready | Managed database decision |
| IEEE 2030.5 translator | Simplified translator foundation | `services/ieee20305-translator` | ECS/Fargate service behind private API | Complete locally | Certification decision if required |
| DSO request parser | `/dso/grid-signal` through gateway | `services/ieee20305-translator` | API Gateway route to service | Local-ready | DSO auth and contracts |
| Grid signals | Kafka topic and DB events | `grid.signals`, `ieee20305_events` | Kafka/MSK and database | Complete locally | Topic retention policy |
| Aggregator | Proposal-only rules | `services/aggregator` | ECS/Fargate service | Complete locally | Optimization rules |
| Dispatch commands | Proposal and approval tables/topics | `dispatch_commands`, `services/approval-workflow` | Database and Kafka/MSK | Complete locally | Approval identity and signatures |
| BaseDevice simulator contract | Shared `tick()` and `getTelemetry()` behavior | `services/common/simulators` | Device abstraction library or simulator test harness | Local-ready | Production simulator/device test strategy |
| Shelly Plug simulated API | Local simulator | `services/shelly-simulator` | Real Shelly connector later | Simulated only | Credentials, consent, sandbox |
| Enode / Easee Core simulated API | Local simulator | `services/enode-simulator` | Real Enode connector later | Simulated only | Credentials, consent, sandbox |
| Heat Pump simulated API | Local simulator | `services/heat-pump-simulator` | Real heat pump provider connector later | Simulated only | Device/provider API choice, credentials, consent |
| ENERSHARE/dataspace export | Minimized IDS/ENERSHARE-ready local export foundation | `services/dataspace-export`, `connectors/` | Real connector or EDC integration | Local foundation | Credentials, connector runtime, contract negotiation |
| Frontend integration path | Call security gateway only | `scripts/run-full-demo-through-gateway.ps1`, docs | CloudFront/S3 or Amplify calling API Gateway | Local-ready | Frontend domain and CORS |
