"""
Semantic Connector for Smart Home IoT Pipeline

This script does the following:

1. Connects to MySQL
2. Reads only unprocessed raw device data
3. Parses the raw JSON payload
4. Converts the payload into Eclipse Ditto digital twin format
5. Adds SAREF-based semantic meaning
6. Converts the enriched data into NGSI-LD
7. Sends the formatted data to Ditto using its API
8. Sends the NGSI-LD entity to Orion-LD
9. Stores processed history + SAREF + NGSI-LD info in MySQL
10. Marks the raw row as processed

This script runs continuously in a loop.
"""

import json
import time
import requests
import mysql.connector
from urllib.parse import quote

print("🚀 Semantic Connector started", flush=True)

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

cursor = conn.cursor(dictionary=True)

# ===============================
# DITTO CONFIG
# ===============================
DITTO_BASE_URL = "http://127.0.0.1:8081/api/2/things"
DITTO_NAMESPACE = "smarthome"

DITTO_HEADERS = {
    "Content-Type": "application/json",
    "x-ditto-pre-authenticated": "user:ditto"
}

# ===============================
# ORION-LD CONFIG
# ===============================
ORION_BASE_URL = "http://127.0.0.1:1026/ngsi-ld/v1"
ORION_ENTITIES_URL = f"{ORION_BASE_URL}/entities"

NGSI_CONTEXT_URL = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld"

ORION_CREATE_HEADERS = {
    "Content-Type": "application/ld+json",
    "Accept": "application/ld+json"
}

ORION_PATCH_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/ld+json",
    "Link": f'<{NGSI_CONTEXT_URL}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'
}

NGSI_CONTEXT = [NGSI_CONTEXT_URL]


def is_orion_available():
    """
    Check whether Orion-LD is running.
    """
    try:
        response = requests.get("http://127.0.0.1:1026/version", timeout=5)
        return response.status_code == 200
    except Exception:
        return False


def get_semantic_mapping(device_type: str):
    """
    Map raw device type to semantic and NGSI-LD meaning.
    """
    if "temperature" in device_type:
        return {
            "feature_name": "temperature",
            "saref_type": "saref:Temperature",
            "unit_type": "saref:DegreeCelsius",
            "ngsi_type": "TemperatureSensor",
            "ngsi_property": "temperature"
        }

    elif "humidity" in device_type:
        return {
            "feature_name": "humidity",
            "saref_type": "saref:Humidity",
            "unit_type": "saref:Percent",
            "ngsi_type": "HumiditySensor",
            "ngsi_property": "humidity"
        }

    elif "meter" in device_type:
        return {
            "feature_name": "meter",
            "saref_type": "saref:Energy",
            "unit_type": "saref:KilowattHour",
            "ngsi_type": "SmartMeter",
            "ngsi_property": "energy"
        }

    elif "light" in device_type:
        return {
            "feature_name": "light",
            "saref_type": "saref:Light",
            "unit_type": "saref:Lux",
            "ngsi_type": "LightSensor",
            "ngsi_property": "illuminance"
        }

    elif "motion" in device_type:
        return {
            "feature_name": "motion",
            "saref_type": "saref:Occupancy",
            "unit_type": "saref:State",
            "ngsi_type": "MotionSensor",
            "ngsi_property": "motion"
        }

    elif "co2" in device_type:
        return {
            "feature_name": "co2",
            "saref_type": "saref:AirQuality",
            "unit_type": "saref:PartsPerMillion",
            "ngsi_type": "CO2Sensor",
            "ngsi_property": "co2"
        }

    elif "pressure" in device_type:
        return {
            "feature_name": "pressure",
            "saref_type": "saref:Pressure",
            "unit_type": "saref:HectoPascal",
            "ngsi_type": "PressureSensor",
            "ngsi_property": "pressure"
        }

    elif "water_flow" in device_type:
        return {
            "feature_name": "water_flow",
            "saref_type": "saref:Flow",
            "unit_type": "saref:LitrePerMinute",
            "ngsi_type": "FlowSensor",
            "ngsi_property": "waterFlow"
        }

    elif "battery" in device_type:
        return {
            "feature_name": "battery",
            "saref_type": "saref:BatteryLevel",
            "unit_type": "saref:Percent",
            "ngsi_type": "BatterySensor",
            "ngsi_property": "batteryLevel"
        }

    elif "door" in device_type:
        return {
            "feature_name": "door",
            "saref_type": "saref:OpenCloseState",
            "unit_type": "saref:State",
            "ngsi_type": "DoorSensor",
            "ngsi_property": "doorState"
        }

    return {
        "feature_name": "measurement",
        "saref_type": "saref:Property",
        "unit_type": "saref:Unit",
        "ngsi_type": "Device",
        "ngsi_property": "measurement"
    }


def build_thing_payload(device_id, device_type, payload):
    """
    Build Ditto payload using both simple value/unit fields and SAREF meaning.
    """
    value = payload.get("value")
    unit = payload.get("unit")
    mapping = get_semantic_mapping(device_type)

    thing_payload = {
        "attributes": {
            "device_id": device_id,
            "device_type": device_type
        },
        "features": {
            mapping["feature_name"]: {
                "properties": {
                    "value": value,
                    "unit": unit,
                    "@type": mapping["saref_type"],
                    "saref:hasValue": value,
                    "saref:isMeasuredIn": mapping["unit_type"]
                }
            }
        }
    }

    return (
        thing_payload,
        mapping["feature_name"],
        value,
        unit,
        mapping["saref_type"],
        mapping["unit_type"],
        mapping["ngsi_type"],
        mapping["ngsi_property"],
    )


def build_ngsild_entity(device_id, device_type, value, unit, saref_type, unit_type, ngsi_type, ngsi_property):
    """
    Build NGSI-LD entity after semantic enrichment.
    """
    entity_id = f"urn:ngsi-ld:{ngsi_type}:{device_id}"

    return {
        "id": entity_id,
        "type": ngsi_type,
        "deviceId": {
            "type": "Property",
            "value": device_id
        },
        "deviceType": {
            "type": "Property",
            "value": device_type
        },
        ngsi_property: {
            "type": "Property",
            "value": value
        },
        "unit": {
            "type": "Property",
            "value": unit
        },
        "sarefType": {
            "type": "Property",
            "value": saref_type
        },
        "sarefUnit": {
            "type": "Property",
            "value": unit_type
        },
        "@context": NGSI_CONTEXT
    }


def upsert_orion_entity(entity: dict):
    """
    Create entity in Orion-LD.
    If it already exists, patch attributes.
    """
    create_response = requests.post(
        ORION_ENTITIES_URL,
        headers=ORION_CREATE_HEADERS,
        json=entity,
        timeout=15
    )

    if create_response.status_code in [201, 204]:
        return create_response

    if create_response.status_code == 409:
        entity_id = entity["id"]
        encoded_id = quote(entity_id, safe="")
        patch_url = f"{ORION_ENTITIES_URL}/{encoded_id}/attrs"

        attrs_payload = {
            key: value
            for key, value in entity.items()
            if key not in ["id", "type", "@context"]
        }

        patch_response = requests.patch(
            patch_url,
            headers=ORION_PATCH_HEADERS,
            json=attrs_payload,
            timeout=15
        )
        return patch_response

    return create_response


# ===============================
# MAIN LOOP
# ===============================
while True:
    try:
        cursor.execute(
            "SELECT * FROM raw_device_data_table WHERE processed = FALSE ORDER BY id ASC"
        )
        rows = cursor.fetchall()

        for row in rows:
            try:
                device_id = row["device_id"]
                device_type = row["device_type"]
                raw_payload = row["raw_payload"]

                if isinstance(raw_payload, str):
                    payload = json.loads(raw_payload)
                else:
                    payload = raw_payload

                thing_id = f"{DITTO_NAMESPACE}:{device_id}"
                ditto_url = f"{DITTO_BASE_URL}/{thing_id}"

                (
                    thing_payload,
                    feature_name,
                    value,
                    unit,
                    saref_type,
                    unit_type,
                    ngsi_type,
                    ngsi_property,
                ) = build_thing_payload(device_id, device_type, payload)

                # 1. Send to Ditto
                ditto_response = requests.put(
                    ditto_url,
                    headers=DITTO_HEADERS,
                    json=thing_payload,
                    params={"timeout": "30s"}
                )

                print(f"Sent to Ditto: {thing_id} | Status: {ditto_response.status_code}", flush=True)

                if ditto_response.status_code not in [200, 201, 202, 204]:
                    print(f"❌ Ditto failed for {thing_id} | Response: {ditto_response.text}", flush=True)
                    continue

                # 2. Send to Orion-LD
                if not is_orion_available():
                    print("❌ Orion-LD is not running on port 1026", flush=True)
                    continue

                ngsi_entity = build_ngsild_entity(
                    device_id=device_id,
                    device_type=device_type,
                    value=value,
                    unit=unit,
                    saref_type=saref_type,
                    unit_type=unit_type,
                    ngsi_type=ngsi_type,
                    ngsi_property=ngsi_property
                )

                orion_response = upsert_orion_entity(ngsi_entity)

                print(f"Sent to Orion-LD: {ngsi_entity['id']} | Status: {orion_response.status_code}", flush=True)

                if orion_response.status_code not in [200, 201, 204]:
                    print(f"❌ Orion-LD failed for {ngsi_entity['id']} | Response: {orion_response.text}", flush=True)
                    continue

                # 3. Store everything in processed table
                insert_query = """
                INSERT INTO processed_device_data
                (
                    entity_id,
                    entity_type,
                    attribute_name,
                    attribute_value,
                    saref_type,
                    saref_unit,
                    ngsi_id,
                    ngsi_type,
                    ngsi_property,
                    ngsi_payload
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """

                cursor.execute(
                    insert_query,
                    (
                        thing_id,
                        device_type,
                        feature_name,
                        json.dumps({
                            "value": value,
                            "unit": unit
                        }),
                        saref_type,
                        unit_type,
                        ngsi_entity["id"],
                        ngsi_type,
                        ngsi_property,
                        json.dumps(ngsi_entity)
                    )
                )

                # 4. Mark raw row as processed
                cursor.execute(
                    "UPDATE raw_device_data_table SET processed = TRUE WHERE id = %s",
                    (row["id"],)
                )

                conn.commit()

                print(f"✅ Completed pipeline for {thing_id}", flush=True)

            except Exception as row_error:
                print(f"Row error (id {row['id']}): {row_error}", flush=True)

    except Exception as e:
        print(f"Main loop error: {e}", flush=True)

    time.sleep(5)