🏠 Smart Home IoT Pipeline (FIWARE + Ditto + MySQL)
📌 Project Overview

This project implements a Smart Home IoT Data Pipeline that processes heterogeneous device data, applies semantic standardization, and enables real-time and historical data visualization.

The system simulates IoT devices (temperature, humidity, smart meter, etc.), processes raw data using a Semantic Connector, and integrates with:

MySQL → Raw + Processed data storage
Eclipse Ditto → Digital Twin (latest device state)
FIWARE Orion-LD → NGSI-LD Context Broker
Streamlit Dashboard → Visualization layer
⚙️ Architecture Flow
Devices / Consumer
        ↓
Raw Data (MySQL - raw_device_data_table)
        ↓
Semantic Connector (Python)
        ↓
   ┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
   │ Processed MySQL (History)     │ Eclipse Ditto (Live State)     │ Orion-LD (NGSI-LD Context)    │
   └───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
        ↓
Streamlit Dashboard
🧠 Key Components
1. Consumer (Data Generator)
Simulates IoT devices
Inserts raw data into MySQL
2. Raw Database
Table: raw_device_data_table
Stores unprocessed device data
3. Semantic Connector

Core processing layer:

Reads raw data
Applies SAREF-based semantic mapping
Converts data to:
Ditto format
NGSI-LD format
Sends data to:
Eclipse Ditto
Orion-LD
Stores processed data in MySQL
4. Processed Database
Table: processed_device_data
Stores:
Cleaned values
SAREF metadata
NGSI-LD metadata
Historical records
5. Eclipse Ditto
Stores latest device state
Used for real-time dashboard updates
6. Orion-LD
Stores data in NGSI-LD standard format
Enables interoperability
7. Streamlit Dashboard
Displays:
Live device state (from Ditto)
Historical data (from MySQL)
NGSI-LD metadata
Trends and charts
🚀 Technologies Used
Python
MySQL
Docker
Eclipse Ditto
FIWARE Orion-LD
Streamlit
NGSI-LD
SAREF Ontology
📦 Setup Instructions
1. Clone Repository
git clone https://github.com/manisharma9/IOT-PIPELINE.git
cd IOT-PIPELINE
2. Install Requirements
pip install -r requirements.txt
3. Start Docker Services

Make sure Docker is running, then start:

docker-compose up -d

This will start:

Eclipse Ditto
MongoDB (for Ditto)
Orion-LD
4. Setup MySQL Database

Create database:

CREATE DATABASE smart_home;

Create raw table:

CREATE TABLE raw_device_data_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50),
    device_type VARCHAR(50),
    raw_payload JSON,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

Create processed table:

CREATE TABLE processed_device_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity_id VARCHAR(100),
    entity_type VARCHAR(50),
    attribute_name VARCHAR(50),
    attribute_value JSON,
    saref_type VARCHAR(100),
    saref_unit VARCHAR(100),
    ngsi_id VARCHAR(100),
    ngsi_type VARCHAR(50),
    ngsi_property VARCHAR(50),
    ngsi_payload JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
▶️ Run the Project
1. Start Consumer
python consumer/consumer.py
2. Start Semantic Connector
python semantic_connector/semantic.py
3. Run Streamlit Dashboard
streamlit run dashboard.py
📊 Dashboard Features
Live device metrics (Ditto)
NGSI-LD structured view
SAREF semantic metadata
Historical trends (MySQL)
Device activity charts
Raw JSON inspection
🔗 API Endpoints
Eclipse Ditto
http://localhost:8081/api/2/things
Orion-LD
http://localhost:1026/ngsi-ld/v1/entities
🧠 Key Concept

The semantic connector is the core component that transforms raw IoT data into standardized formats and distributes it to different systems for storage and visualization.

🎯 Project Goal

To demonstrate:

IoT data interoperability
Semantic data modeling using SAREF
NGSI-LD standard usage
Digital twin representation using Ditto
Real-time + historical data integration