# Client-Facing Presentation Script

This script is written for a client-facing technical walkthrough.

## 2 Minute Version

AD-FLEX demonstrates a safe smart-home energy flexibility pipeline. External HTTP traffic now enters through a local security gateway that mirrors the future API Gateway and WAF pattern. The gateway checks an API key, applies rate limiting and request inspection, forwards valid requests, and audits every decision.

After that edge layer, the pipeline receives household telemetry from HTTP or MQTT, normalizes it, and adds semantic energy meaning using SAREF4ENER.

Known readings are mapped deterministically. Unknown readings can optionally use a local small language model through Ollama, but the SLM is only a helper and the system still works without it.

The pipeline then translates semantic events into simplified IEEE 2030.5-style resources and accepts a mock DSO grid signal. The aggregator creates a dispatch proposal, but it does not execute anything. An authorized reviewer must review, approve, and mark the proposal ready.

Even after approval, the dispatch adapter is mock-only. It creates simulated sent and result events and clearly marks that no real household device was controlled. The device API translation layer also converts the approved command into simulated Shelly Plug and Enode / Easee Core API language, again without real credentials or real control.

Finally, the dataspace export service shares minimized and pseudonymized summaries, so an outside stakeholder can see workflow status without raw household data.

The key message is safety: gateway security, semantic meaning, grid interpretation, approval, audit, mock dispatch, simulated device API translation, and privacy-aware export, with no real device control.

## 5 Minute Version

This project solves a smart-grid coordination problem. Household devices can provide flexibility, but raw IoT telemetry alone is not enough. A grid operator needs energy-specific meaning, a safe translation layer, approval governance, audit history, and privacy controls before any data can be shared.

Phase 1 created the foundation. Telemetry enters over HTTP or MQTT, is published to Kafka, normalized by the engine, and stored in TimescaleDB.

The local security gateway update added an edge layer in front of external HTTP traffic. This means a future frontend, DSO client, or telemetry client calls the gateway first. Locally, it represents API Gateway, WAF, rate limiting, IP filtering, request inspection, and audit logging.

Phase 2 added deterministic SAREF4ENER mapping. This matters because SAREF4ENER gives the data a standard energy vocabulary. For example, active power and battery state of charge become semantic energy readings instead of arbitrary JSON fields.

Phase 3 added optional SLM-assisted mapping. The important design choice is that deterministic mapping still comes first. Known readings never call the SLM. Only unknown readings can ask Phi-3 Mini through Ollama for a suggested semantic mapping, and invalid or unavailable SLM output falls back safely.

Phase 4 added an IEEE 2030.5-style translator foundation. It converts semantic events into simple resources such as `MirrorMeterReading`, `DERStatus`, and `GridSignal`. This is useful because IEEE 2030.5 is a grid/DER communication standard, but this project does not claim certification.

Phase 5 added the aggregator. It consumes DSO grid signals and creates proposal-only dispatch commands. The aggregator is deliberately rule-based and explainable. It can propose actions such as reducing EV charging or delaying flexible load, but it cannot execute them.

Phase 6 added approval workflow. A proposal must move through allowed transitions: proposed, reviewed, approved, and ready_to_dispatch. Invalid shortcuts are rejected. This creates governance before anything reaches the dispatch preparation layer.

Phase 7 added a mock dispatch adapter. This is the safety boundary. It only accepts ready events that explicitly say `no_execution: true` and `execution_blocked: true`. It simulates a device command and result, but no real household command is sent.

Phase 8 added dataspace export. It exposes catalog and export endpoints for minimized summaries. Household and device IDs are pseudonymized, raw private payloads are not exported, and every export is audited. This is a dataspace-style foundation, not a certified ENERSHARE connector.

The production hardening work added runbooks, final architecture documentation, troubleshooting guidance, security limitations, and helper scripts so the system can be reviewed consistently.

The architecture also includes a bidirectional load management workflow: a DSO grid request moves forward through the semantic and IEEE 2030.5-style translators, then the approved command moves backward into simulated device-specific APIs. The device integrations are a simulated Shelly Plug and a simulated Enode / Easee Core charger.

## Technical Backup Explanation

The system is event-driven and uses Kafka topics between services. TimescaleDB stores durable telemetry, semantic events, translated events, proposal records, approval audit, mock dispatch audit, and dataspace export audit rows.

Each service has one responsibility:

- ingestion receives data
- security gateway protects external HTTP entry points
- engine normalizes it
- semantic connector adds meaning
- translator creates grid-style resources
- aggregator proposes actions
- approval workflow governs transitions
- mock adapter simulates dispatch
- device command translator maps approved ready commands to simulated Shelly and Enode API calls
- dataspace export shares safe summaries

This makes the local demo environment easier to explain and safer to extend.

## Problem We Solve

Raw household IoT data is not enough for energy flexibility. The pipeline shows how to turn it into understandable, auditable, and shareable flexibility information.

## Why Security Gateway Matters

The security gateway makes the local environment match the production architecture sequence. It keeps external traffic on one entry point, adds local API key checks, rate limits, request inspection, correlation IDs, and audit rows. Later this maps to AWS API Gateway, WAF, JWT authorizers, TLS/mTLS, and managed secrets.

## Why Semantic Connector Matters

The semantic connector makes readings interoperable. Without it, `active_power_kw`, `battery_soc_percent`, or `roomHeat` are just local names. With semantic mapping, they become part of a shared energy vocabulary.

## Why SAREF4ENER Matters

SAREF4ENER is an energy-focused semantic model. It helps make readings understandable across energy systems, demos, and future integrations.

## Why SLM Helps

The SLM helps with unknown readings. It is not trusted blindly. It is optional, validated, and only used after deterministic mapping fails.

## Why IEEE 2030.5-Style Translator Matters

The translator creates grid-friendly resource shapes. It helps bridge semantic telemetry and grid/DER concepts while staying clear that this is not full certified IEEE 2030.5.

## Why Aggregator And Approval Workflow Matter

The aggregator proposes what could be done. The approval workflow controls whether a proposal can move forward. This separates decision support from execution.

## Why Mock Dispatch Is Safe

Mock dispatch proves the end-to-end workflow without touching real household devices. Every sent and result event says it is simulated and no real execution happened.

## Why Device API Translation Matters

The load management workflow requires approved grid requests to be translated back into the language of end-device APIs. The device command translator does that for simulated Shelly Plug and Enode / Easee Core devices. It supports fixed kW and percentage load reduction, but every command is local, simulated, and marked `no_real_execution: true`.

## Why Dataspace Export Matters

Dataspace export lets outside stakeholders see safe summaries without raw household data. It demonstrates sharing readiness while keeping privacy boundaries visible.
