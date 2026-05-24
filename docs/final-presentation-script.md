# Final Presentation Script

This script is written for a business-friendly final demo.

## 2 Minute Version

AD-FLEX demonstrates a safe smart-home energy flexibility pipeline. It starts with household telemetry from HTTP or MQTT, normalizes it, and adds semantic energy meaning using SAREF4ENER.

Known readings are mapped deterministically. Unknown readings can optionally use a local small language model through Ollama, but the SLM is only a helper and the system still works without it.

The pipeline then translates semantic events into simplified IEEE 2030.5-style resources and accepts a mock DSO grid signal. The aggregator creates a dispatch proposal, but it does not execute anything. A reviewer must review, approve, and mark the proposal ready.

Even after approval, the dispatch adapter is mock-only. It creates simulated sent and result events and clearly marks that no real household device was controlled.

Finally, the dataspace export service shares minimized and pseudonymized summaries, so an outside stakeholder can see the demo status without raw household data.

The key message is safety: semantic meaning, grid interpretation, approval, audit, mock dispatch, and privacy-aware export, with no real device control.

## 5 Minute Version

This project solves a smart-grid coordination problem. Household devices can provide flexibility, but raw IoT telemetry alone is not enough. A grid operator needs energy-specific meaning, a safe translation layer, approval governance, audit history, and privacy controls before any data can be shared.

Phase 1 created the foundation. Telemetry enters over HTTP or MQTT, is published to Kafka, normalized by the engine, and stored in TimescaleDB.

Phase 2 added deterministic SAREF4ENER mapping. This matters because SAREF4ENER gives the data a standard energy vocabulary. For example, active power and battery state of charge become semantic energy readings instead of arbitrary JSON fields.

Phase 3 added optional SLM-assisted mapping. The important design choice is that deterministic mapping still comes first. Known readings never call the SLM. Only unknown readings can ask Phi-3 Mini through Ollama for a suggested semantic mapping, and invalid or unavailable SLM output falls back safely.

Phase 4 added an IEEE 2030.5-style translator foundation. It converts semantic events into simple resources such as `MirrorMeterReading`, `DERStatus`, and `GridSignal`. This is useful because IEEE 2030.5 is a grid/DER communication standard, but this project does not claim certification.

Phase 5 added the aggregator. It consumes DSO grid signals and creates proposal-only dispatch commands. The aggregator is deliberately rule-based and explainable. It can propose actions such as reducing EV charging or delaying flexible load, but it cannot execute them.

Phase 6 added approval workflow. A proposal must move through allowed transitions: proposed, reviewed, approved, and ready_to_dispatch. Invalid shortcuts are rejected. This creates governance before anything reaches the dispatch preparation layer.

Phase 7 added a mock dispatch adapter. This is the safety boundary. It only accepts ready events that explicitly say `no_execution: true` and `execution_blocked: true`. It simulates a device command and result, but no real household command is sent.

Phase 8 added dataspace export. It exposes catalog and export endpoints for minimized summaries. Household and device IDs are pseudonymized, raw private payloads are not exported, and every export is audited. This is a dataspace-style foundation, not a certified ENERSHARE connector.

Phase 9 polished the final demo. It added the runbook, final architecture, troubleshooting, security limitations, and helper scripts so the project can be presented consistently.

## Technical Backup Explanation

The system is event-driven and uses Kafka topics between services. TimescaleDB stores durable telemetry, semantic events, translated events, proposal records, approval audit, mock dispatch audit, and dataspace export audit rows.

Each service has one responsibility:

- ingestion receives data
- engine normalizes it
- semantic connector adds meaning
- translator creates grid-style resources
- aggregator proposes actions
- approval workflow governs transitions
- mock adapter simulates dispatch
- dataspace export shares safe summaries

This makes the demo easier to explain and safer to extend.

## Problem We Solve

Raw household IoT data is not enough for energy flexibility. The pipeline shows how to turn it into understandable, auditable, and shareable flexibility information.

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

## Why Dataspace Export Matters

Dataspace export lets outside stakeholders see safe summaries without raw household data. It demonstrates sharing readiness while keeping privacy boundaries visible.
