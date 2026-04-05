# 🏠 Smart Home IoT Data Pipeline  
### (FIWARE + Eclipse Ditto + MySQL + Streamlit)

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
