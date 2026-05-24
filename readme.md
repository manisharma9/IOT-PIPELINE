# 🏠 Smart Home IoT Data Pipeline  
### (FIWARE + Eclipse Ditto + MySQL + Streamlit)

# Phase 1 Production Foundation: Energy Flexibility Pipeline

This repository still contains the original Smart Home IoT pipeline with MySQL, Eclipse Ditto, Orion-LD, Streamlit, and the Vercel dashboard. That legacy pipeline has not been removed.

Phase 1 adds a new production-style foundation beside the old pipeline:

```text
HTTP telemetry / MQTT telemetry
        |
        v
Kafka topic: raw.telemetry
        |
        v
Engine service
        |
        v
TimescaleDB hypertables:
  - raw_telemetry
  - normalized_telemetry
  - processing_errors
```

## Phase 2 SAREF4ENER Semantic Connector Foundation

Phase 2 keeps the Phase 1 foundation intact and adds a deterministic semantic enrichment step:

```text
Kafka topic: normalized.telemetry
        |
        v
SAREF4ENER semantic connector
        |
        +--> TimescaleDB hypertable: semantic_events
        |
        v
Kafka topic: semantic.enriched
```

The engine still writes `raw_telemetry` and `normalized_telemetry`. It now also publishes each normalized reading to `normalized.telemetry`. The new `services/semantic-connector` service consumes those normalized events, applies a deterministic SAREF4ENER-style mapping, writes `semantic_events`, and publishes the enriched event to `semantic.enriched`.

Phase 2 intentionally does not include SLM/Ollama mapping, IEEE 2030.5, aggregator dispatch, or ENERSHARE export.

## Phase 3 Optional SLM-Assisted Mapping

Phase 3 keeps the deterministic Phase 2 mapping as the safe default and adds an optional SLM-assisted fallback for unknown readings only:

```text
Kafka topic: normalized.telemetry
        |
        v
SAREF4ENER semantic connector
        |
        +--> known reading: deterministic mapping
        |
        +--> unknown reading and SLM_ENABLED=true:
              Phi-3 Mini through Ollama suggests a mapping
        |
        +--> invalid/unavailable SLM: existing unmapped fallback
        |
        +--> TimescaleDB hypertable: semantic_events
        |
        v
Kafka topic: semantic.enriched
```

The SLM path is optional. The pipeline still works when `SLM_ENABLED=false`, when Ollama is not running, or when the SLM returns invalid output. Known readings such as `active_power_kw` never call the SLM.

Phase 3 intentionally does not include IEEE 2030.5, aggregator dispatch, or ENERSHARE export.

## Phase 4 IEEE 2030.5 Translator Foundation

Phase 4 adds a translator foundation after the semantic enrichment topic:

```text
Kafka topic: semantic.enriched
        |
        v
IEEE 2030.5 translator foundation
        |
        +--> TimescaleDB hypertable: ieee20305_events
        |
        v
Kafka topic: ieee20305.translated
```

The translator converts semantic events into simple, explainable IEEE 2030.5-style payloads such as `MirrorMeterReading`, `DERStatus`, and `DERControlCandidate`. This is a foundation only and does not claim full IEEE 2030.5 certification.

Phase 4 also adds a mock DSO grid signal endpoint:

```text
POST /dso/grid-signal
        |
        v
Validate DSO signal
        |
        v
GridSignal style payload
        |
        +--> TimescaleDB hypertable: ieee20305_events
        |
        v
Kafka topic: grid.signals
```

The mock DSO endpoint stores and publishes grid signals for later aggregator work. It does not dispatch commands to households.

## Phase 5 Aggregator and Dispatch Command Proposal Path

Phase 5 adds a proposal-only Aggregator after the Phase 4 grid signal topic:

```text
Kafka topic: grid.signals
        |
        v
Aggregator
        |
        +--> TimescaleDB hypertable: dispatch_commands
        |
        +--> Kafka topic: dispatch.command.proposed
        |
        v
Kafka topic: dispatch.command.audit
```

The Aggregator validates incoming GridSignal events and creates safe dispatch command proposals such as `reduce_ev_charging`, `delay_flexible_load`, `increase_pv_export_if_available`, and `reduce_export_limit`. It is intentionally proposal-only. It does not approve, execute, or send commands to households or devices.

The Aggregator also exposes read-only HTTP endpoints:

- `GET /health`
- `GET /dispatch/proposals`
- `GET /dispatch/proposals/:id`

## Phase 6 Approval Workflow and Safe Dispatch Preparation

Phase 6 adds an approval workflow after the proposal topic:

```text
Kafka topic: dispatch.command.proposed
        |
        v
Approval workflow
        |
        +--> dispatch_commands status update
        |
        +--> TimescaleDB hypertable: dispatch_approval_audit
        |
        +--> Kafka topic: dispatch.approval.audit
        |
        v
Kafka topic: dispatch.command.ready
```

The approval workflow lets a reviewer move a proposal through safe review statuses. It still does not execute commands or send anything to households.

Allowed status transitions:

- `proposed -> reviewed`
- `proposed -> rejected`
- `reviewed -> approved`
- `reviewed -> rejected`
- `approved -> ready_to_dispatch`

All other transitions are rejected with `invalid_status_transition`.

The approval workflow exposes:

- `GET /health`
- `GET /approvals/proposals`
- `GET /approvals/proposals/:id`
- `POST /approvals/proposals/:id/review`
- `POST /approvals/proposals/:id/approve`
- `POST /approvals/proposals/:id/reject`
- `POST /approvals/proposals/:id/mark-ready`

Ready events include `no_execution: true` and `execution_blocked: true`.

## New Phase 1 Components

- `services/ingestion-api` - Express API with `POST /telemetry`
- `services/mqtt-subscriber` - MQTT `telemetry/#` subscriber that publishes valid messages to Kafka
- `services/mqtt-broker` - Mosquitto broker config
- `services/engine` - Kafka consumer that validates, normalizes, and writes TimescaleDB rows
- `schemas/telemetry.schema.json` - shared household telemetry payload contract
- `database/timescale/001_init.sql` - TimescaleDB schema and hypertable migration
- `examples/household_telemetry.json` - sample household energy telemetry
- `docs/phase-1-implementation-report.md` - beginner-friendly implementation report

## New Phase 2 Components

- `services/semantic-connector` - Kafka consumer and producer for deterministic SAREF4ENER-style enrichment
- `services/semantic-connector/src/saref4ener-mapping.js` - known reading mappings and safe unmapped fallback
- `services/semantic-connector/src/semantic-builder.js` - semantic payload and event builder
- `database/timescale/002_semantic_events.sql` - `semantic_events` hypertable migration
- `docs/phase-2-implementation-report.md` - beginner-friendly Phase 2 implementation report

## New Phase 3 Components

- `services/semantic-connector/src/slm-mapper.js` - optional Ollama `/api/generate` client for unknown readings
- `services/semantic-connector/src/slm-validation.js` - strict validation for SLM JSON output
- `examples/household_unknown_telemetry.json` - unknown readings that can trigger SLM-assisted mapping
- `docs/phase-3-implementation-report.md` - beginner-friendly Phase 3 implementation report

## New Phase 4 Components

- `services/ieee20305-translator` - Kafka consumer, HTTP API, and translator service
- `services/ieee20305-translator/src/translator.js` - semantic and DSO signal translation logic
- `services/ieee20305-translator/src/db.js` - TimescaleDB helper for `ieee20305_events`
- `services/ieee20305-translator/src/kafka.js` - Kafka consume/publish helper
- `database/timescale/003_ieee20305_events.sql` - `ieee20305_events` hypertable migration
- `schemas/grid-signal.schema.json` - mock DSO grid signal payload contract
- `examples/dso_grid_signal.json` - sample DSO curtailment request
- `docs/phase-4-implementation-report.md` - beginner-friendly Phase 4 implementation report

## New Phase 5 Components

- `services/aggregator` - proposal-only Kafka consumer, publisher, and read API
- `services/aggregator/src/aggregator.js` - rule-based dispatch proposal logic
- `services/aggregator/src/validation.js` - GridSignal and translated event shape validation
- `services/aggregator/src/db.js` - TimescaleDB helper for `dispatch_commands`
- `services/aggregator/src/kafka.js` - Kafka consume/publish helper for proposal and audit topics
- `database/timescale/004_dispatch_commands.sql` - `dispatch_commands` hypertable migration
- `examples/dispatch_proposal_example.json` - sample proposal-only dispatch command record
- `docs/phase-5-implementation-report.md` - beginner-friendly Phase 5 implementation report

## New Phase 6 Components

- `services/approval-workflow` - approval workflow and safe dispatch preparation API
- `services/approval-workflow/src/status-machine.js` - allowed status transition rules
- `services/approval-workflow/src/validation.js` - approval request validation
- `services/approval-workflow/src/workflow.js` - status update, audit, and ready event logic
- `services/approval-workflow/src/db.js` - TimescaleDB helper for dispatch proposals and approval audit
- `services/approval-workflow/src/kafka.js` - Kafka helper for approval audit and ready events
- `database/timescale/005_dispatch_approval_audit.sql` - `dispatch_approval_audit` hypertable migration
- `examples/approval_review_request.json` - sample review request
- `examples/approval_approve_request.json` - sample approve request
- `examples/approval_reject_request.json` - sample reject request
- `examples/approval_mark_ready_request.json` - sample mark-ready request
- `docs/phase-6-implementation-report.md` - beginner-friendly Phase 6 implementation report

## Run Only the New Production Foundation

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine semantic-connector ieee20305-translator aggregator approval-workflow
```

For Phase 3 SLM-assisted mapping, install and run Ollama on the host machine, then pull Phi-3 Mini:

```powershell
ollama pull phi3:mini
ollama serve
```

The default `.env.example` settings are:

```text
IEEE20305_TRANSLATED_TOPIC=ieee20305.translated
GRID_SIGNALS_TOPIC=grid.signals
DISPATCH_PROPOSED_TOPIC=dispatch.command.proposed
DISPATCH_AUDIT_TOPIC=dispatch.command.audit
DISPATCH_READY_TOPIC=dispatch.command.ready
DISPATCH_APPROVAL_AUDIT_TOPIC=dispatch.approval.audit
IEEE20305_TRANSLATOR_PORT=3002
AGGREGATOR_PORT=3003
APPROVAL_WORKFLOW_PORT=3004
SLM_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=phi3:mini
SLM_TIMEOUT_MS=8000
```

Set `SLM_ENABLED=false` to use only deterministic mappings and the existing unmapped fallback.

Check containers:

```powershell
docker compose ps
```

Send sample HTTP telemetry:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_telemetry.json"
```

Expected API result:

```json
{
  "status": "accepted",
  "topic": "raw.telemetry"
}
```

Verify Kafka received a message:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic raw.telemetry `
  --from-beginning `
  --max-messages 1
```

Verify normalized Kafka flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic normalized.telemetry `
  --from-beginning `
  --max-messages 1
```

Verify semantic enriched Kafka flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic semantic.enriched `
  --from-beginning `
  --max-messages 1
```

Verify IEEE 2030.5-style translated Kafka flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic ieee20305.translated `
  --from-beginning `
  --max-messages 1
```

Send unknown telemetry to test Phase 3 SLM-assisted mapping:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/telemetry" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/household_unknown_telemetry.json"
```

When Ollama is running and `SLM_ENABLED=true`, unknown readings can be stored with `mapping_source = 'slm_assisted'`. If Ollama is unavailable or returns invalid JSON, the same readings are stored with `mapping_source = 'unmapped'` and the connector keeps running.

Send a mock DSO grid signal to test Phase 4:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3002/dso/grid-signal" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/dso_grid_signal.json"
```

Verify grid signal Kafka flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic grid.signals `
  --from-beginning `
  --max-messages 1
```

Verify Phase 5 dispatch proposal flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.proposed `
  --from-beginning `
  --max-messages 1
```

Verify Phase 5 audit flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.audit `
  --from-beginning `
  --max-messages 1
```

Read proposals through the Aggregator API:

```powershell
Invoke-RestMethod -Uri "http://localhost:3003/dispatch/proposals" -Method Get
```

Read proposals through the approval workflow API:

```powershell
Invoke-RestMethod -Uri "http://localhost:3004/approvals/proposals" -Method Get
```

Review, approve, and mark a proposal ready:

```powershell
$proposalId = 1

Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/review" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_review_request.json"

Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/approve" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_approve_request.json"

Invoke-RestMethod `
  -Uri "http://localhost:3004/approvals/proposals/$proposalId/mark-ready" `
  -Method Post `
  -ContentType "application/json" `
  -InFile "examples/approval_mark_ready_request.json"
```

Verify Phase 6 approval audit flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.approval.audit `
  --from-beginning `
  --max-messages 1
```

Verify Phase 6 ready event flow:

```powershell
docker compose exec kafka kafka-console-consumer `
  --bootstrap-server kafka:29092 `
  --topic dispatch.command.ready `
  --from-beginning `
  --max-messages 1
```

Verify TimescaleDB rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, household_id, device_id, protocol FROM raw_telemetry ORDER BY received_at DESC LIMIT 5;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, device_id, reading_name, reading_value, reading_unit FROM normalized_telemetry ORDER BY processed_at DESC LIMIT 10;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, device_id, reading_name, saref4ener_concept, mapping_source, mapping_confidence FROM semantic_events ORDER BY processed_at DESC LIMIT 10;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, resource_type, reading_name, translation_status, translation_confidence FROM ieee20305_events ORDER BY processed_at DESC LIMIT 10;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT id, community_id, requested_action, proposed_action, target_kw, status, created_at FROM dispatch_commands ORDER BY created_at DESC LIMIT 10;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT dispatch_command_id, previous_status, new_status, action, reviewer_id, created_at FROM dispatch_approval_audit ORDER BY created_at DESC LIMIT 10;"
```

Check processing errors:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT occurred_at, error_type, error_message FROM processing_errors ORDER BY occurred_at DESC LIMIT 10;"
```

Run the lightweight local unit tests with a working Node.js runtime:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/*.test.js services/semantic-connector/test/*.test.js services/ieee20305-translator/test/*.test.js services/aggregator/test/*.test.js services/approval-workflow/test/*.test.js
```

## Phase 1 Scope Limits

This phase does not implement:

- SLM Semantic Connector
- SAREF4ENER enrichment
- IEEE 2030.5 translator
- Aggregator dispatch commands
- ENERSHARE export
- full production security for incoming telemetry

Phase 2 now adds the SAREF4ENER semantic connector that consumes `normalized.telemetry` and produces `semantic.enriched` events.

## Phase 2 Scope Limits

This phase does not implement:

- real SLM/Ollama semantic mapping
- IEEE 2030.5 translator
- aggregator dispatch commands
- ENERSHARE export
- full production security layer

Phase 3 now adds optional SLM-assisted mapping with Phi-3 Mini through Ollama for unknown readings while keeping the deterministic mapping path as the safe default.

## Phase 3 Scope Limits

This phase does not implement:

- IEEE 2030.5 translator
- aggregator dispatch commands
- ENERSHARE export
- model-based mapping for known deterministic readings
- mandatory Ollama dependency

SLM-assisted mapping is only used for unknown readings, and it falls back safely to `unmapped`.

## Phase 4 Scope Limits

This phase does not implement:

- full certified IEEE 2030.5 stack
- production mTLS
- aggregator dispatch commands
- household command execution
- ENERSHARE export

The translator emits IEEE 2030.5-style foundation payloads for later phases.

## Phase 5 Scope Limits

This phase does not implement:

- real household control
- automatic command execution
- approval workflow
- production mTLS
- ENERSHARE export
- real device availability optimization

The Aggregator creates proposed dispatch commands and audit records only. Phase 6 should add review and approval status transitions before any dispatch preparation.

## Phase 6 Scope Limits

This phase does not implement:

- household command execution
- real device dispatch
- automatic approval
- production identity provider
- production mTLS
- ENERSHARE export
- optimization engine

The approval workflow prepares proposals for a later safe dispatch adapter. Even `ready_to_dispatch` means preparation only, not execution.

---

## 📌 Project Overview

This project implements a **Smart Home IoT Data Pipeline** that handles heterogeneous device data, applies semantic standardization, and enables both real-time and historical data visualization.

The system simulates IoT devices (temperature sensors, smart meters, etc.), processes raw data using a **custom Semantic Connector**, and integrates with:

- **MySQL** → Raw & Processed data storage  
- **Eclipse Ditto** → Digital Twin (latest device state)  
- **FIWARE Orion-LD** → Context Broker (NGSI-LD standard)  
- **Streamlit Dashboard** → Visualization layer  

---

## ⚙️ Architecture Flow

```
IoT Devices / Data Generator
        ↓
Raw Data (MySQL - raw_device_data_table)
        ↓
Semantic Connector (Python)
        ↓
 ┌───────────────────────────────┐
 │                               │
 ↓                               ↓
Processed Data (MySQL)     Eclipse Ditto (Digital Twin)
                                ↓
                         FIWARE Orion-LD
                                ↓
                       Streamlit Dashboard
```

---

## 🧠 Key Components

### 1️⃣ Data Generator (Consumer)
- Simulates IoT devices
- Generates random sensor data
- Stores raw JSON payloads in MySQL

---

### 2️⃣ MySQL Database

#### Raw Table
Stores unprocessed device data:
- `device_id`
- `device_type`
- `raw_payload (JSON)`
- `created_at`
- `processed (boolean)`

#### Processed Table
Stores standardized data after semantic transformation.

---

### 3️⃣ Semantic Connector (Python)

Custom-built component that:

- Reads unprocessed raw data  
- Parses JSON payload  
- Converts data into:
  - **Eclipse Ditto format**
  - **NGSI-LD format (FIWARE)**  
- Applies semantic meaning (SAREF-inspired mapping)  
- Sends data to:
  - Eclipse Ditto (Digital Twin)
  - Orion-LD (Context Broker)
- Stores processed data in MySQL  
- Marks raw data as processed  

---

### 4️⃣ Eclipse Ditto (Digital Twin)

- Maintains latest state of devices
- Provides real-time representation
- Stores device twin models

---

### 5️⃣ FIWARE Orion-LD

- Context Broker using NGSI-LD
- Enables:
  - Data sharing
  - Standardized APIs
  - Dataspace interoperability

---

### 6️⃣ Streamlit Dashboard

- Displays:
  - Real-time device data
  - Historical trends
- Auto-refresh enabled
- Clean UI for monitoring smart home data

---

## 🚀 How to Run the Project

### 1️⃣ Clone Repository
```
git clone https://github.com/manisharma9/IOT-PIPELINE.git
cd IOT-PIPELINE
```

---

### 2️⃣ Setup MySQL
- Install MySQL
- Create database:

```
CREATE DATABASE smart_home;
```

---

### 3️⃣ Run FIWARE Orion-LD (Docker)

```
docker run -d --name mongo -p 27017:27017 mongo

docker run -d --name orion \
  --link mongo \
  -p 1026:1026 \
  fiware/orion-ld
```

---

### 4️⃣ Run Eclipse Ditto

```
docker run -d -p 8080:8080 eclipse/ditto
```

---

### 5️⃣ Install Python Dependencies

```
pip install mysql-connector-python requests pandas streamlit
```

---

### 6️⃣ Run Components

#### ▶ Data Generator
```
python consumer.py
```

#### ▶ Semantic Connector
```
python semantic_connector.py
```

#### ▶ Dashboard
```
streamlit run dashboard.py
```

---

## 📊 Example Device Payload

```
{
  "temperature": 23.5,
  "humidity": 60,
  "device_id": "sensor_1"
}
```

---

## 🎯 Key Features

- End-to-end IoT data pipeline  
- Real-time + historical data  
- Digital Twin integration (Ditto)  
- NGSI-LD standardization  
- Semantic data transformation  
- Interactive dashboard  

---

## 🧩 Technologies Used

- Python  
- MySQL  
- Docker  
- Eclipse Ditto  
- FIWARE Orion-LD  
- Streamlit  

---

## 📚 Concepts Used

- IoT Data Pipelines  
- Digital Twins  
- Semantic Interoperability  
- NGSI-LD Information Model  
- Smart Home Systems  

---

## 👨‍💻 Author

Mani Sharma  
Master’s in Business Analytics – Maynooth University  

---
