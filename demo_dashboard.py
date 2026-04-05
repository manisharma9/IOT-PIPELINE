"""
Smart Home IoT Dashboard Demo

Full demo version that mimics the real dashboard structure.

Demo behavior:
- App starts in paused mode
- Click Start Consumer first
- Then click Start Semantic
- Only when BOTH are running, live values update automatically

It does not require:
- MySQL
- Eclipse Ditto
- Orion-LD
- Docker
- local Python scripts
"""

import streamlit as st
import pandas as pd
import random
import json
from datetime import datetime, timedelta
from streamlit_autorefresh import st_autorefresh

# ============================================================
# PAGE SETUP
# ============================================================
st.set_page_config(
    page_title="DEMO - Smart Home IoT Dashboard",
    page_icon="🏠",
    layout="wide"
)

st_autorefresh(interval=4000, key="dashboard_refresh")

# ============================================================
# STYLING
# ============================================================
st.markdown("""
<style>
    .main {
        padding-top: 1.2rem;
    }
    .main-title {
        font-size: 42px;
        font-weight: 700;
        margin-bottom: 0;
    }
    .sub-text {
        font-size: 16px;
        color: #94a3b8;
        margin-top: 4px;
        margin-bottom: 20px;
    }
    .info-box {
        padding: 12px 14px;
        border-radius: 12px;
        background-color: rgba(59, 130, 246, 0.08);
        border: 1px solid rgba(59, 130, 246, 0.15);
        margin-bottom: 16px;
    }
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div>
    <div class="main-title">🏠 DEMO - Smart Home IoT Dashboard</div>
    <div class="sub-text">MySQL processed history + Ditto live twin state (Demo Mode)</div>
</div>
""", unsafe_allow_html=True)

# ============================================================
# DEVICE CONFIG
# ============================================================
DEVICE_CONFIG = [
    {
        "device_id": "dev001",
        "entity_type": "temperature_sensor",
        "feature_name": "temperature",
        "ngsi_type": "TemperatureSensor",
        "ngsi_property": "temperature",
        "saref_type": "saref:Temperature",
        "saref_unit": "saref:DegreeCelsius",
        "unit": "C",
        "min": 18.0,
        "max": 32.0,
        "start": 24.0
    },
    {
        "device_id": "dev002",
        "entity_type": "humidity_sensor",
        "feature_name": "humidity",
        "ngsi_type": "HumiditySensor",
        "ngsi_property": "humidity",
        "saref_type": "saref:Humidity",
        "saref_unit": "saref:Percent",
        "unit": "%",
        "min": 35.0,
        "max": 75.0,
        "start": 58.0
    },
    {
        "device_id": "dev003",
        "entity_type": "smart_meter",
        "feature_name": "meter",
        "ngsi_type": "SmartMeter",
        "ngsi_property": "energy",
        "saref_type": "saref:Energy",
        "saref_unit": "saref:KilowattHour",
        "unit": "kWh",
        "min": 300.0,
        "max": 1800.0,
        "start": 650.0
    },
    {
        "device_id": "dev004",
        "entity_type": "light_sensor",
        "feature_name": "light",
        "ngsi_type": "LightSensor",
        "ngsi_property": "illuminance",
        "saref_type": "saref:Light",
        "saref_unit": "saref:Lux",
        "unit": "lux",
        "min": 100.0,
        "max": 700.0,
        "start": 330.0
    },
    {
        "device_id": "dev005",
        "entity_type": "motion_sensor",
        "feature_name": "motion",
        "ngsi_type": "MotionSensor",
        "ngsi_property": "motion",
        "saref_type": "saref:Occupancy",
        "saref_unit": "saref:State",
        "unit": "state",
        "min": 0,
        "max": 1,
        "start": 0
    },
    {
        "device_id": "dev006",
        "entity_type": "co2_sensor",
        "feature_name": "co2",
        "ngsi_type": "CO2Sensor",
        "ngsi_property": "co2",
        "saref_type": "saref:AirQuality",
        "saref_unit": "saref:PartsPerMillion",
        "unit": "ppm",
        "min": 300.0,
        "max": 900.0,
        "start": 430.0
    },
    {
        "device_id": "dev007",
        "entity_type": "pressure_sensor",
        "feature_name": "pressure",
        "ngsi_type": "PressureSensor",
        "ngsi_property": "pressure",
        "saref_type": "saref:Pressure",
        "saref_unit": "saref:HectoPascal",
        "unit": "hPa",
        "min": 995.0,
        "max": 1025.0,
        "start": 1008.0
    },
    {
        "device_id": "dev008",
        "entity_type": "water_flow_sensor",
        "feature_name": "water_flow",
        "ngsi_type": "FlowSensor",
        "ngsi_property": "waterFlow",
        "saref_type": "saref:Flow",
        "saref_unit": "saref:LitrePerMinute",
        "unit": "L/min",
        "min": 4.0,
        "max": 25.0,
        "start": 11.0
    },
    {
        "device_id": "dev009",
        "entity_type": "battery_sensor",
        "feature_name": "battery",
        "ngsi_type": "BatterySensor",
        "ngsi_property": "batteryLevel",
        "saref_type": "saref:BatteryLevel",
        "saref_unit": "saref:Percent",
        "unit": "%",
        "min": 20.0,
        "max": 100.0,
        "start": 88.0
    },
    {
        "device_id": "dev010",
        "entity_type": "door_sensor",
        "feature_name": "door",
        "ngsi_type": "DoorSensor",
        "ngsi_property": "doorState",
        "saref_type": "saref:OpenCloseState",
        "saref_unit": "saref:State",
        "unit": "state",
        "min": 0,
        "max": 1,
        "start": 0
    }
]

# ============================================================
# SESSION STATE
# ============================================================
if "consumer_running" not in st.session_state:
    st.session_state.consumer_running = False

if "semantic_running" not in st.session_state:
    st.session_state.semantic_running = False

if "demo_df" not in st.session_state or "current_values" not in st.session_state:
    st.session_state.demo_df = None
    st.session_state.current_values = {}

# ============================================================
# HELPERS
# ============================================================
def pretty_label(text: str) -> str:
    return text.replace("_", " ").title()


def is_pipeline_active():
    return st.session_state.consumer_running and st.session_state.semantic_running


def generate_next_value(device, current_value):
    entity_type = device["entity_type"]

    if entity_type in ["motion_sensor", "door_sensor"]:
        if random.random() < 0.2:
            return 1 if current_value == 0 else 0
        return current_value

    if entity_type == "smart_meter":
        step = random.uniform(3, 18)
        return round(current_value + step, 2)

    if entity_type == "battery_sensor":
        step = random.uniform(-0.6, -0.05)
        new_value = max(device["min"], min(device["max"], current_value + step))
        return round(new_value, 2)

    step = random.uniform(-2.5, 2.5)
    if random.random() < 0.1:
        step += random.uniform(-5, 5)

    new_value = current_value + step
    new_value = max(device["min"], min(device["max"], new_value))
    return round(new_value, 2)


def build_ditto_object(device, value):
    return {
        "thingId": f"smarthome:{device['device_id']}",
        "policyId": f"smarthome:{device['device_id']}",
        "attributes": {
            "device_id": device["device_id"],
            "device_type": device["entity_type"]
        },
        "features": {
            device["feature_name"]: {
                "properties": {
                    "value": value,
                    "unit": device["unit"],
                    "@type": device["saref_type"],
                    "saref:hasValue": value,
                    "saref:isMeasuredIn": device["saref_unit"]
                }
            }
        }
    }


def build_ngsi_object(device, value):
    return {
        "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld",
        "id": f"urn:ngsi-ld:{device['ngsi_type']}:{device['device_id']}",
        "type": device["ngsi_type"],
        "deviceId": {
            "type": "Property",
            "value": device["device_id"]
        },
        "deviceType": {
            "type": "Property",
            "value": device["entity_type"]
        },
        device["ngsi_property"]: {
            "type": "Property",
            "value": value
        },
        "unit": {
            "type": "Property",
            "value": device["unit"]
        },
        "sarefType": {
            "type": "Property",
            "value": device["saref_type"]
        },
        "sarefUnit": {
            "type": "Property",
            "value": device["saref_unit"]
        }
    }


def initialize_demo_data():
    now = datetime.now()
    records = []
    current_values = {}

    for device in DEVICE_CONFIG:
        current = device["start"]
        current_values[device["device_id"]] = current

        for i in range(55):
            ts = now - timedelta(minutes=(55 - i))
            current = generate_next_value(device, current)

            records.append({
                "id": len(records) + 1,
                "entity_id": f"smarthome:{device['device_id']}",
                "entity_type": device["entity_type"],
                "attribute_name": device["feature_name"],
                "attribute_value": json.dumps({
                    "value": current,
                    "unit": device["unit"]
                }),
                "numeric_value": current,
                "unit": device["unit"],
                "saref_type": device["saref_type"],
                "saref_unit": device["saref_unit"],
                "ngsi_id": f"urn:ngsi-ld:{device['ngsi_type']}:{device['device_id']}",
                "ngsi_type": device["ngsi_type"],
                "ngsi_property": device["ngsi_property"],
                "ngsi_payload": json.dumps(build_ngsi_object(device, current)),
                "created_at": ts
            })

        current_values[device["device_id"]] = current

    return pd.DataFrame(records), current_values


def update_demo_data():
    df = st.session_state.demo_df
    current_values = st.session_state.current_values
    now = datetime.now()

    if is_pipeline_active():
        new_rows = []

        for device in DEVICE_CONFIG:
            old_value = current_values[device["device_id"]]
            new_value = generate_next_value(device, old_value)
            current_values[device["device_id"]] = new_value

            new_rows.append({
                "id": int(df["id"].max()) + len(new_rows) + 1,
                "entity_id": f"smarthome:{device['device_id']}",
                "entity_type": device["entity_type"],
                "attribute_name": device["feature_name"],
                "attribute_value": json.dumps({
                    "value": new_value,
                    "unit": device["unit"]
                }),
                "numeric_value": new_value,
                "unit": device["unit"],
                "saref_type": device["saref_type"],
                "saref_unit": device["saref_unit"],
                "ngsi_id": f"urn:ngsi-ld:{device['ngsi_type']}:{device['device_id']}",
                "ngsi_type": device["ngsi_type"],
                "ngsi_property": device["ngsi_property"],
                "ngsi_payload": json.dumps(build_ngsi_object(device, new_value)),
                "created_at": now
            })

        df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)
        df = df.sort_values("created_at", ascending=False).head(1200).copy()

        st.session_state.demo_df = df
        st.session_state.current_values = current_values


def get_ditto_live_df():
    rows = []
    for device in DEVICE_CONFIG:
        value = st.session_state.current_values[device["device_id"]]
        rows.append({
            "thing_id": f"smarthome:{device['device_id']}",
            "device_id": device["device_id"],
            "device_type": device["entity_type"],
            "feature_name": device["feature_name"],
            "value": value,
            "unit": device["unit"],
            "saref_type": device["saref_type"]
        })
    return pd.DataFrame(rows)


def get_ditto_raw_json():
    payload = []
    for device in DEVICE_CONFIG:
        value = st.session_state.current_values[device["device_id"]]
        payload.append(build_ditto_object(device, value))
    return payload


def get_ngsi_raw_json():
    payload = []
    for device in DEVICE_CONFIG:
        value = st.session_state.current_values[device["device_id"]]
        payload.append(build_ngsi_object(device, value))
    return payload


def latest_status(df):
    latest_rows = (
        df.sort_values("created_at", ascending=False)
        .groupby("entity_type", as_index=False)
        .first()
    )

    latest_rows["latest_value"] = latest_rows.apply(
        lambda row: (
            "Active" if row["numeric_value"] == 1 else "Inactive"
        ) if row["entity_type"] in ["motion_sensor", "door_sensor"]
        else (
            f"{round(float(row['numeric_value']), 2)} {row['unit']}"
            if pd.notna(row["numeric_value"]) else "N/A"
        ),
        axis=1
    )
    return latest_rows


# ============================================================
# INIT / UPDATE DATA
# ============================================================
if st.session_state.demo_df is None or not st.session_state.current_values:
    demo_df, current_values = initialize_demo_data()
    st.session_state.demo_df = demo_df
    st.session_state.current_values = current_values
else:
    update_demo_data()

df = st.session_state.demo_df.copy()
df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")

ditto_df = get_ditto_live_df()
ditto_raw = get_ditto_raw_json()
ngsi_raw = get_ngsi_raw_json()

# ============================================================
# SIDEBAR
# ============================================================
st.sidebar.header("Pipeline Controls")

c1, c2 = st.sidebar.columns(2)

with c1:
    if st.button("Start Consumer", use_container_width=True):
        st.session_state.consumer_running = True
        st.success("Consumer started")

with c2:
    if st.button("Stop Consumer", use_container_width=True):
        st.session_state.consumer_running = False
        st.session_state.semantic_running = False
        st.warning("Consumer stopped")

c3, c4 = st.sidebar.columns(2)

with c3:
    if st.button("Start Semantic", use_container_width=True):
        if st.session_state.consumer_running:
            st.session_state.semantic_running = True
            st.success("Semantic connector started")
        else:
            st.error("Start Consumer first")

with c4:
    if st.button("Stop Semantic", use_container_width=True):
        st.session_state.semantic_running = False
        st.warning("Semantic connector stopped")

st.sidebar.markdown("---")
st.sidebar.subheader("Current Status")

consumer_status = "🟢 Running" if st.session_state.consumer_running else "🔴 Stopped"
semantic_status = "🟢 Running" if st.session_state.semantic_running else "🔴 Stopped"

st.sidebar.write(f"**Consumer:** {consumer_status}")
st.sidebar.write(f"**Semantic Connector:** {semantic_status}")

st.sidebar.markdown("---")
st.sidebar.header("Filter Data")

entity_types = ["All"] + sorted(df["entity_type"].dropna().unique().tolist())
selected_entity = st.sidebar.selectbox("Select Device Type", entity_types)
record_limit = st.sidebar.slider("Recent Records to Show", 5, 100, 20)
# show_raw_json = st.sidebar.checkbox("Show Raw JSON Sections", value=True)

if selected_entity != "All":
    filtered_df = df[df["entity_type"] == selected_entity].copy()
else:
    filtered_df = df.copy()

filtered_df = filtered_df.sort_values("created_at", ascending=False).head(record_limit).copy()

# ============================================================
# DEMO NOTE
# ============================================================
if is_pipeline_active():
    pipeline_state_text = "Live demo is active. Data updates automatically because both Consumer and Semantic Connector are running."
elif st.session_state.consumer_running and not st.session_state.semantic_running:
    pipeline_state_text = "Consumer is running. Start Semantic to begin live processed data updates."
else:
    pipeline_state_text = "Demo is paused. Start Consumer first, then Start Semantic to begin live data updates."

st.markdown(f"""
<div class="info-box">
    <b>Demo Mode:</b> {pipeline_state_text}
</div>
""", unsafe_allow_html=True)


latest_df = latest_status(df)


# ============================================================
# DITTO LIVE SECTION
# ============================================================
st.markdown("## Eclipse Ditto Live Twin State")

device_type_order = latest_df["entity_type"].tolist()
cards_per_row = 5

for start in range(0, len(device_type_order), cards_per_row):
    row_device_types = device_type_order[start:start + cards_per_row]
    metric_cols = st.columns(len(row_device_types))

    for i, device_type in enumerate(row_device_types):
        with metric_cols[i]:
            row = latest_df[latest_df["entity_type"] == device_type].iloc[0]
            st.metric(pretty_label(device_type), row["latest_value"])

# ============================================================
# NGSI-LD TABLE
# ============================================================
st.markdown("## NGSI-LD View from Processed MySQL Table")

ngsi_df = filtered_df.copy()
ngsi_df["value_only"] = ngsi_df["numeric_value"]
ngsi_df["display_value"] = ngsi_df.apply(
    lambda row: (
        "Active" if row["numeric_value"] == 1 else "Inactive"
    ) if row["entity_type"] in ["motion_sensor", "door_sensor"]
    else (
        f"{round(float(row['numeric_value']), 2)} {row['unit']}"
        if pd.notna(row["numeric_value"]) else "N/A"
    ),
    axis=1
)

ngsi_df = ngsi_df[
    [
        "ngsi_id",
        "ngsi_type",
        "ngsi_property",
        "value_only",
        "unit",
        "display_value",
        "entity_type",
        "attribute_name",
        "saref_type",
        "saref_unit",
        "created_at"
    ]
].copy()

st.dataframe(ngsi_df, use_container_width=True, hide_index=True)

# ============================================================
# OVERVIEW
# ============================================================
st.markdown("## Overview")

left, right = st.columns([2, 1])

with left:
    st.markdown("### Device Activity")
    entity_count = (
        df.groupby("entity_type")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    st.bar_chart(entity_count.set_index("entity_type"))

with right:
    st.markdown("### Latest Device Status from Processed Data")
    latest_display = latest_df[
        ["entity_type", "attribute_name", "latest_value", "created_at", "saref_type"]
    ].copy()
    st.dataframe(latest_display, use_container_width=True, hide_index=True)

# ============================================================
# DITTO TABLE
# ============================================================
st.markdown("## Ditto Latest Twin State")

ditto_display = ditto_df.copy()
ditto_display["latest_value"] = ditto_display.apply(
    lambda row: (
        "Active" if row["value"] == 1 else "Inactive"
    ) if row["device_type"] in ["motion_sensor", "door_sensor"]
    else (
        f"{round(float(row['value']), 2)} {row['unit']}"
        if pd.notna(row["value"]) else "N/A"
    ),
    axis=1
)

ditto_display = ditto_display[
    ["thing_id", "device_id", "device_type", "feature_name", "latest_value", "saref_type"]
]

st.dataframe(ditto_display, use_container_width=True, hide_index=True)

# ============================================================
# HISTORY CHARTS
# ============================================================
st.markdown("## Sensor Trends from Processed History")

chart_device_types = sorted(df["entity_type"].dropna().unique().tolist())

for device_type in chart_device_types:
    device_df = df[df["entity_type"] == device_type].copy()
    st.markdown(f"### {pretty_label(device_type)}")

    chart_df = device_df.sort_values("created_at")[["created_at", "numeric_value"]].dropna()
    chart_df = chart_df.rename(
        columns={"created_at": "Time", "numeric_value": pretty_label(device_type)}
    )

    if not chart_df.empty:
        st.line_chart(chart_df.set_index("Time"))
    else:
        st.info(f"No data available for {pretty_label(device_type)}")

# ============================================================
# PROCESSED HISTORY TABLE
# ============================================================
st.markdown("## Recent Processed Records from MySQL")

display_df = filtered_df.copy()
display_df["attribute_value_display"] = display_df.apply(
    lambda row: (
        "Active" if row["numeric_value"] == 1 else "Inactive"
    ) if row["entity_type"] in ["motion_sensor", "door_sensor"]
    else (
        f"{round(float(row['numeric_value']), 2)} {row['unit']}"
        if pd.notna(row["numeric_value"]) else "N/A"
    ),
    axis=1
)

display_df = display_df[
    [
        "id",
        "entity_id",
        "entity_type",
        "attribute_name",
        "attribute_value_display",
        "saref_type",
        "saref_unit",
        "ngsi_id",
        "ngsi_type",
        "ngsi_property",
        "created_at"
    ]
].copy()

display_df = display_df.rename(columns={"attribute_value_display": "attribute_value"})

st.dataframe(display_df, use_container_width=True, hide_index=True)

# ============================================================
# RAW JSON SECTIONS
# ============================================================
# if show_raw_json:
#     st.markdown("## Raw Ditto JSON")
#     with st.expander("Show raw data from Ditto API"):
#         st.json(ditto_raw)

#     st.markdown("## Raw NGSI-LD JSON")
#     with st.expander("Show simulated NGSI-LD entities"):
#         st.json(ngsi_raw)

# ============================================================
# RAW JSON SECTIONS (ALWAYS VISIBLE)
# ============================================================

st.markdown("## Raw Ditto JSON")

with st.expander("View Ditto Twin JSON"):
    st.json(ditto_raw)

st.markdown("## Raw NGSI-LD JSON")

with st.expander("View NGSI-LD Entities"):
    st.json(ngsi_raw)