# Smart Home IoT Pipeline

## Overview

This project demonstrates an end-to-end Smart Home IoT data pipeline for heterogeneous device data.

The system simulates raw IoT device readings, enriches them with semantic meaning using SAREF, converts them into NGSI-LD-compatible structures, stores historical processed data in MySQL, maintains live digital twin state in Eclipse Ditto, and updates NGSI-LD entity state in Orion-LD.

A Streamlit dashboard is used to monitor the system.

## Main Components

### 1. Consumer
The consumer generates simulated raw device data and inserts it into the raw MySQL table.

Examples of simulated devices:
- temperature sensor
- humidity sensor
- smart meter
- light sensor
- motion sensor
- CO2 sensor
- pressure sensor
- water flow sensor
- battery sensor
- door sensor

### 2. Semantic Connector
The semantic connector reads unprocessed raw records and:
- interprets the device type
- applies SAREF semantic meaning
- builds Eclipse Ditto digital twin payloads
- builds NGSI-LD entities
- sends live state to Ditto
- sends entity state to Orion-LD
- stores processed history in MySQL

### 3. MySQL
MySQL is used for:
- raw device data storage
- processed historical data storage
- storing SAREF and NGSI-LD related metadata for dashboard use

### 4. Eclipse Ditto
Ditto stores the latest live digital twin state of each device.

### 5. Orion-LD
Orion-LD stores the latest NGSI-LD entity state for context management.

### 6. Streamlit Dashboard
The dashboard provides:
- live Ditto state
- historical processed trends from MySQL
- NGSI-LD view from MySQL
- SAREF semantic details from MySQL

## Project Structure

```text
IOT-PIPELINE/
│
├── consumer/
│   └── consumer.py
│
├── semantic_connector/
│   └── semantic.py
│
├── sql/
│   └── init.sql
│
├── dashboard.py
├── docker-compose.yml
├── requirements.txt
└── README.md