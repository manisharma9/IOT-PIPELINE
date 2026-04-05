"""
Smart Home IoT Dashboard

This dashboard shows:
1. Live Ditto twin state from Ditto API
2. Historical processed data from MySQL
3. SAREF semantic metadata from MySQL
4. NGSI-LD metadata from MySQL

Ditto remains live API based.
SAREF and NGSI-LD are read from processed_device_data table.
"""

import streamlit as st
import mysql.connector
import pandas as pd
import json
import subprocess
import os
import signal
import requests
import atexit
from streamlit_autorefresh import st_autorefresh

# ============================================================
# FILE PATH SETUP
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
consumer_path = os.path.join(BASE_DIR, "consumer", "consumer.py")
semantic_path = os.path.join(BASE_DIR, "semantic_connector", "semantic.py")

# ============================================================
# PAGE SETUP
# ============================================================
st.set_page_config(
    page_title="Smart Home IoT Dashboard",
    page_icon="🏠",
    layout="wide"
)

st_autorefresh(interval=5000, key="dashboard_refresh")

# ============================================================
# CONFIG
# ============================================================
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "smart_home",
    "port": 3306
}

DITTO_BASE_URL = "http://127.0.0.1:8081/api/2/things"
DITTO_HEADERS = {
    "x-ditto-pre-authenticated": "user:ditto"
}

# ============================================================
# SESSION STATE
# ============================================================
if "consumer_process" not in st.session_state:
    st.session_state.consumer_process = None

if "semantic_process" not in st.session_state:
    st.session_state.semantic_process = None

if "cleanup_registered" not in st.session_state:
    st.session_state.cleanup_registered = False

# ============================================================
# STYLING
# ============================================================
st.markdown("""
<style>
    .main {
        padding-top: 1.5rem;
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
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div>
    <div class="main-title">🏠 Smart Home IoT Dashboard</div>
    <div class="sub-text">MySQL processed history + Ditto live twin state</div>
</div>
""", unsafe_allow_html=True)

# ============================================================
# PROCESS CONTROL
# ============================================================
def is_process_running(process):
    return process is not None and process.poll() is None


def start_consumer():
    if not is_process_running(st.session_state.consumer_process):
        st.session_state.consumer_process = subprocess.Popen(
            ["python", consumer_path],
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        )
        return True
    return False


def stop_consumer():
    process = st.session_state.consumer_process
    if is_process_running(process):
        try:
            if os.name == "nt":
                process.terminate()
            else:
                os.kill(process.pid, signal.SIGTERM)
        except Exception:
            pass
        st.session_state.consumer_process = None
        return True
    return False


def start_semantic():
    if not is_process_running(st.session_state.semantic_process):
        st.session_state.semantic_process = subprocess.Popen(
            ["python", semantic_path],
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        )
        return True
    return False


def stop_semantic():
    process = st.session_state.semantic_process
    if is_process_running(process):
        try:
            if os.name == "nt":
                process.terminate()
            else:
                os.kill(process.pid, signal.SIGTERM)
        except Exception:
            pass
        st.session_state.semantic_process = None
        return True
    return False


def cleanup_processes():
    try:
        process = st.session_state.get("consumer_process")
        if process is not None and process.poll() is None:
            if os.name == "nt":
                process.terminate()
            else:
                os.kill(process.pid, signal.SIGTERM)
    except Exception:
        pass

    try:
        process = st.session_state.get("semantic_process")
        if process is not None and process.poll() is None:
            if os.name == "nt":
                process.terminate()
            else:
                os.kill(process.pid, signal.SIGTERM)
    except Exception:
        pass


if not st.session_state.cleanup_registered:
    atexit.register(cleanup_processes)
    st.session_state.cleanup_registered = True

# ============================================================
# MYSQL FUNCTIONS
# ============================================================
@st.cache_data(ttl=4)
def fetch_data():
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)

    query = """
    SELECT
        id,
        entity_id,
        entity_type,
        attribute_name,
        attribute_value,
        saref_type,
        saref_unit,
        ngsi_id,
        ngsi_type,
        ngsi_property,
        ngsi_payload,
        created_at
    FROM processed_device_data
    ORDER BY created_at DESC
    """

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    return pd.DataFrame(rows)


def parse_attribute_value(value):
    try:
        if isinstance(value, str):
            return json.loads(value)
        elif isinstance(value, dict):
            return value
    except Exception:
        pass
    return {"value": None, "unit": None}


def prepare_data(df):
    df = df.copy()
    parsed = df["attribute_value"].apply(parse_attribute_value)
    df["numeric_value"] = parsed.apply(lambda x: x.get("value"))
    df["unit"] = parsed.apply(lambda x: x.get("unit"))
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    df["numeric_value"] = pd.to_numeric(df["numeric_value"], errors="coerce")
    return df


def get_device_summary(df):
    latest_rows = (
        df.sort_values("created_at", ascending=False)
        .groupby("entity_type", as_index=False)
        .first()
    )

    latest_rows["latest_value"] = latest_rows.apply(
        lambda row: f"{round(float(row['numeric_value']), 2)} {row['unit']}"
        if pd.notna(row["numeric_value"]) else "N/A",
        axis=1
    )

    return latest_rows[
        [
            "entity_type",
            "attribute_name",
            "latest_value",
            "created_at",
            "saref_type",
            "ngsi_id",
            "ngsi_type",
            "ngsi_property"
        ]
    ]


def pretty_label(device_type):
    return device_type.replace("_", " ").title()

# ============================================================
# DITTO FUNCTIONS
# ============================================================
@st.cache_data(ttl=4)
def fetch_ditto_data():
    response = requests.get(
        DITTO_BASE_URL,
        headers=DITTO_HEADERS,
        timeout=10
    )
    response.raise_for_status()
    data = response.json()

    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        if "items" in data and isinstance(data["items"], list):
            return data["items"]
        return [data]

    return []


def extract_feature_value(feature_data):
    if not isinstance(feature_data, dict):
        return None, None, None

    properties = feature_data.get("properties", {})
    value = properties.get("value")
    unit = properties.get("unit")
    saref_type = properties.get("@type")

    return value, unit, saref_type


def flatten_ditto_things(things):
    rows = []

    for thing in things:
        thing_id = thing.get("thingId", "N/A")
        attributes = thing.get("attributes", {})
        device_id = attributes.get("device_id", "N/A")
        device_type = attributes.get("device_type", "N/A")
        features = thing.get("features", {})

        for feature_name, feature_data in features.items():
            value, unit, saref_type = extract_feature_value(feature_data)
            rows.append({
                "thing_id": thing_id,
                "device_id": device_id,
                "device_type": device_type,
                "feature_name": feature_name,
                "value": value,
                "unit": unit,
                "saref_type": saref_type
            })

    return pd.DataFrame(rows)


def get_ditto_metric(df, device_type):
    if df.empty:
        return "N/A"

    filtered = df[df["device_type"] == device_type]

    if filtered.empty:
        return "N/A"

    row = filtered.iloc[0]
    value = row["value"]
    unit = row["unit"]

    if value is None:
        return "N/A"

    try:
        return f"{round(float(value), 2)} {unit}"
    except Exception:
        return f"{value} {unit}"






def parse_ngsi_payload(value):
    try:
        if isinstance(value, str):
            return json.loads(value)
        elif isinstance(value, dict):
            return value
    except Exception:
        pass
    return None


# ============================================================
# SIDEBAR
# ============================================================
st.sidebar.header("Pipeline Controls")

consumer_col1, consumer_col2 = st.sidebar.columns(2)

with consumer_col1:
    if st.button("Start Consumer", width="stretch"):
        if start_consumer():
            st.sidebar.success("Consumer started")
        else:
            st.sidebar.info("Consumer already running")

with consumer_col2:
    if st.button("Stop Consumer", width="stretch"):
        if stop_consumer():
            st.sidebar.warning("Consumer stopped")
        else:
            st.sidebar.info("Consumer is not running")

semantic_col1, semantic_col2 = st.sidebar.columns(2)

with semantic_col1:
    if st.button("Start Semantic", width="stretch"):
        if start_semantic():
            st.sidebar.success("Semantic connector started")
        else:
            st.sidebar.info("Semantic connector already running")

with semantic_col2:
    if st.button("Stop Semantic", width="stretch"):
        if stop_semantic():
            st.sidebar.warning("Semantic connector stopped")
        else:
            st.sidebar.info("Semantic connector is not running")

st.sidebar.markdown("---")
st.sidebar.subheader("Current Status")

consumer_status = "🟢 Running" if is_process_running(st.session_state.consumer_process) else "🔴 Stopped"
semantic_status = "🟢 Running" if is_process_running(st.session_state.semantic_process) else "🔴 Stopped"

st.sidebar.write(f"**Consumer:** {consumer_status}")
st.sidebar.write(f"**Semantic Connector:** {semantic_status}")

st.sidebar.markdown("---")
st.sidebar.header("Filter Data")

# ============================================================
# MAIN
# ============================================================
try:
    df = fetch_data()

    if df.empty:
        st.warning("No processed data available yet.")
        st.stop()

    df = prepare_data(df)

    ditto_error = None
    try:
        ditto_raw = fetch_ditto_data()
        ditto_df = flatten_ditto_things(ditto_raw)
    except Exception as ditto_ex:
        ditto_raw = []
        ditto_df = pd.DataFrame()
        ditto_error = str(ditto_ex)

    entity_types = ["All"] + sorted(df["entity_type"].dropna().unique().tolist())
    selected_entity = st.sidebar.selectbox("Select Device Type", entity_types)
    record_limit = st.sidebar.slider("Recent Records to Show", 5, 100, 20)

    if selected_entity != "All":
        filtered_df = df[df["entity_type"] == selected_entity].copy()
    else:
        filtered_df = df.copy()

    filtered_df = filtered_df.head(record_limit)

    # ============================================================
    # DITTO LIVE SECTION
    # ============================================================
    st.markdown("## Eclipse Ditto Live Twin State")

    if ditto_error:
        st.warning(f"Could not fetch Ditto data: {ditto_error}")

    latest_status_df = get_device_summary(df)
    device_types = latest_status_df["entity_type"].tolist()

    if device_types:
        cards_per_row = 5

        for start in range(0, len(device_types), cards_per_row):
            row_device_types = device_types[start:start + cards_per_row]
            metric_cols = st.columns(len(row_device_types))

            for i, device_type in enumerate(row_device_types):
                with metric_cols[i]:
                    st.metric(
                        pretty_label(device_type),
                        get_ditto_metric(ditto_df, device_type)
                    )

    # ============================================================
    # NGSI-LD TABLE FROM MYSQL
    # ============================================================
    st.markdown("## NGSI-LD View from Processed MySQL Table")

    ngsi_df = filtered_df.copy()

    ngsi_df["value_only"] = ngsi_df["numeric_value"]
    ngsi_df["display_value"] = ngsi_df.apply(
        lambda row: f"{round(float(row['numeric_value']), 2)} {row['unit']}"
        if pd.notna(row["numeric_value"]) else "N/A",
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

    st.dataframe(ngsi_df, width="stretch", hide_index=True)

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
        st.markdown("### Latest Device Status from MySQL")
        summary_df = get_device_summary(df)
        st.dataframe(summary_df, width="stretch", hide_index=True)

    # ============================================================
    # DITTO TABLE
    # ============================================================
    st.markdown("## Ditto Latest Twin State")

    if not ditto_df.empty:
        ditto_display = ditto_df.copy()
        ditto_display["latest_value"] = ditto_display.apply(
            lambda row: f"{round(float(row['value']), 2)} {row['unit']}"
            if pd.notna(row["value"]) else "N/A",
            axis=1
        )

        ditto_display = ditto_display[
            ["thing_id", "device_id", "device_type", "feature_name", "latest_value", "saref_type"]
        ]

        st.dataframe(ditto_display, width="stretch", hide_index=True)

    # ============================================================
    # MYSQL HISTORY CHARTS
    # ============================================================
    st.markdown("## Sensor Trends from MySQL History")

    chart_device_types = sorted(df["entity_type"].dropna().unique().tolist())

    for device_type in chart_device_types:
        device_df = df[df["entity_type"] == device_type].copy()
        st.markdown(f"### {pretty_label(device_type)}")

        if not device_df.empty:
            chart_df = device_df.sort_values("created_at")[["created_at", "numeric_value"]].dropna()
            chart_df = chart_df.rename(
                columns={"created_at": "Time", "numeric_value": pretty_label(device_type)}
            )

            if not chart_df.empty:
                st.line_chart(chart_df.set_index("Time"))

    # ============================================================
    # MYSQL HISTORY TABLE
    # ============================================================
    st.markdown("## Recent Processed Records from MySQL")

    display_df = filtered_df.copy()
    display_df["attribute_value"] = display_df.apply(
        lambda row: f"{round(float(row['numeric_value']), 2)} {row['unit']}"
        if pd.notna(row["numeric_value"]) else "N/A",
        axis=1
    )

    display_df = display_df[
        [
            "id",
            "entity_id",
            "entity_type",
            "attribute_name",
            "attribute_value",
            "saref_type",
            "saref_unit",
            "ngsi_id",
            "ngsi_type",
            "ngsi_property",
            "created_at"
        ]
    ]

    st.dataframe(display_df, width="stretch", hide_index=True)

    # ============================================================
    # RAW JSON SECTIONS
    # ============================================================
    st.markdown("## Raw Ditto JSON")
    with st.expander("Show raw data from Ditto API"):
        st.json(ditto_raw)


    st.markdown("## Raw NGSI-LD Payload from MySQL")
    with st.expander("Show stored NGSI payloads from processed table"):
        ngsi_payload_rows = filtered_df["ngsi_payload"].dropna().tolist()
        parsed_payloads = [parse_ngsi_payload(x) for x in ngsi_payload_rows]
        parsed_payloads = [x for x in parsed_payloads if x is not None]
        st.json(parsed_payloads)
    # st.markdown("## Raw NGSI-LD Payload from MySQL")
    # with st.expander("Show stored NGSI payloads from processed table"):
    #     ngsi_payload_rows = filtered_df[["ngsi_id", "ngsi_payload"]].dropna().copy()

    #     parsed_payloads = []
    #     for _, row in ngsi_payload_rows.iterrows():
    #         parsed_payload = parse_ngsi_payload(row["ngsi_payload"])
    #         parsed_payloads.append({
    #             "ngsi_id": row["ngsi_id"],
    #             "ngsi_payload": parsed_payload
    #         })

    #     st.json(parsed_payloads)

except Exception as e:
    st.error(f"Error loading dashboard: {e}")