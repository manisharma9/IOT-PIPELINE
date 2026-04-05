"""
Consumer Script for Smart Home IoT Pipeline

Simulates multiple smart home IoT devices and inserts raw data into MySQL.
"""

import mysql.connector
import json
import time
import random

print("🚀 Consumer started", flush=True)

# ===============================
# MYSQL CONNECTION
# ===============================
conn = mysql.connector.connect(
    host="localhost",
    user="root",
    password="root",
    database="smart_home",
    port=3306
)

cursor = conn.cursor()

# ===============================
# DEVICE DEFINITIONS (10 DEVICES)
# ===============================
devices = [
    ("dev001", "temperature_sensor"),
    ("dev002", "humidity_sensor"),
    ("dev003", "smart_meter"),
    ("dev004", "light_sensor"),
    ("dev005", "motion_sensor"),
    ("dev006", "co2_sensor"),
    ("dev007", "pressure_sensor"),
    ("dev008", "water_flow_sensor"),
    ("dev009", "battery_sensor"),
    ("dev010", "door_sensor")
]

# Initial states
device_state = {
    "dev001": 24,    # temperature
    "dev002": 60,    # humidity
    "dev003": 500,   # energy meter
    "dev004": 300,   # light
    "dev005": 0,     # motion (0/1)
    "dev006": 400,   # CO2 ppm
    "dev007": 1013,  # pressure hPa
    "dev008": 10,    # water flow L/min
    "dev009": 90,    # battery %
    "dev010": 0      # door (0 closed, 1 open)
}


def generate_payload(device_id, device_type):
    current = device_state[device_id]

    change = random.uniform(-1, 1)

    if random.random() < 0.1:
        change += random.uniform(-5, 5)

    # ===============================
    # DEVICE-SPECIFIC LOGIC
    # ===============================

    if "temperature" in device_type:
        new_value = max(15, min(35, current + change))
        unit = "C"

    elif "humidity" in device_type:
        new_value = max(30, min(90, current + change))
        unit = "%"

    elif "meter" in device_type:
        new_value = max(0, current + random.uniform(10, 50))
        unit = "kWh"

    elif "light" in device_type:
        new_value = max(0, min(1000, current + random.uniform(-50, 50)))
        unit = "lux"

    elif "motion" in device_type:
        new_value = random.choice([0, 1])  # binary
        unit = "motion"

    elif "co2" in device_type:
        new_value = max(300, min(2000, current + random.uniform(-50, 50)))
        unit = "ppm"

    elif "pressure" in device_type:
        new_value = max(980, min(1050, current + random.uniform(-5, 5)))
        unit = "hPa"

    elif "water_flow" in device_type:
        new_value = max(0, current + random.uniform(-2, 5))
        unit = "L/min"

    elif "battery" in device_type:
        new_value = max(0, current - random.uniform(0.1, 0.5))  # slowly drains
        unit = "%"

    elif "door" in device_type:
        new_value = random.choice([0, 1])  # open/close
        unit = "state"

    else:
        new_value = current
        unit = "unknown"

    new_value = round(new_value, 2)
    device_state[device_id] = new_value

    return {
        "value": new_value,
        "unit": unit
    }


# ===============================
# MAIN LOOP
# ===============================
while True:
    try:
        device_id, device_type = random.choice(devices)
        payload = generate_payload(device_id, device_type)

        query = """
        INSERT INTO raw_device_data_table (device_id, device_type, raw_payload, processed)
        VALUES (%s, %s, %s, FALSE)
        """

        cursor.execute(query, (
            device_id,
            device_type,
            json.dumps(payload)
        ))

        conn.commit()

        print(f"✅ Inserted: {device_id} | {device_type} | {payload}", flush=True)

    except Exception as e:
        print(f"❌ Consumer error: {e}", flush=True)

    time.sleep(2)