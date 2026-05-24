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

## New Phase 1 Components

- `services/ingestion-api` - Express API with `POST /telemetry`
- `services/mqtt-subscriber` - MQTT `telemetry/#` subscriber that publishes valid messages to Kafka
- `services/mqtt-broker` - Mosquitto broker config
- `services/engine` - Kafka consumer that validates, normalizes, and writes TimescaleDB rows
- `schemas/telemetry.schema.json` - shared household telemetry payload contract
- `database/timescale/001_init.sql` - TimescaleDB schema and hypertable migration
- `examples/household_telemetry.json` - sample household energy telemetry
- `docs/phase-1-implementation-report.md` - beginner-friendly implementation report

## Run Only the New Production Foundation

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up -d --build zookeeper kafka mqtt-broker timescaledb ingestion-api mqtt-subscriber engine
```

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

Verify TimescaleDB rows:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, household_id, device_id, protocol FROM raw_telemetry ORDER BY received_at DESC LIMIT 5;"
```

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT event_time, device_id, reading_name, reading_value, reading_unit FROM normalized_telemetry ORDER BY processed_at DESC LIMIT 10;"
```

Check processing errors:

```powershell
docker compose exec timescaledb psql -U energy_user -d energy_flex -c "SELECT occurred_at, error_type, error_message FROM processing_errors ORDER BY occurred_at DESC LIMIT 10;"
```

Run the lightweight local unit tests with a working Node.js runtime:

```powershell
node --test services/ingestion-api/test/validation.test.js services/engine/test/normalizer.test.js
```

## Phase 1 Scope Limits

This phase does not implement:

- SLM Semantic Connector
- SAREF4ENER enrichment
- IEEE 2030.5 translator
- Aggregator dispatch commands
- ENERSHARE export
- full production security for incoming telemetry

Recommended Phase 2: build the SAREF4ENER semantic connector that consumes `normalized.telemetry` and produces `semantic.enriched` events.

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
