"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  normalizeTelemetryPayload,
  validateTelemetry
} = require("../../common/telemetry-validator");
const { createApp } = require("../src/index");

function loadSamplePayload() {
  const samplePath = path.resolve(__dirname, "../../../examples/household_telemetry.json");
  return JSON.parse(fs.readFileSync(samplePath, "utf8"));
}

function request(app, method, route, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      })
        .then(async (response) => {
          const json = await response.json();
          resolve({ status: response.status, body: json });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

test("valid household telemetry passes validation", () => {
  const payload = loadSamplePayload();
  const result = validateTelemetry(payload);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("telemetry missing household_id fails validation", () => {
  const payload = loadSamplePayload();
  delete payload.household_id;

  const result = validateTelemetry(payload);

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.path === "household_id"), true);
});

test("telemetry with a non-numeric reading fails validation", () => {
  const payload = loadSamplePayload();
  payload.readings.active_power_kw.value = "high";

  const result = validateTelemetry(payload);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.path === "readings.active_power_kw.value"),
    true
  );
});

test("compatible deviceId/deviceType/data payload normalizes to pipeline telemetry shape", () => {
  const normalized = normalizeTelemetryPayload({
    communityId: "community-dublin-north",
    householdId: "household-compat",
    deviceId: "heat-pump-001",
    deviceType: "heat_pump",
    timestamp: "2026-05-25T12:00:00Z",
    data: {
      heat_pump_power_kw: {
        value: 2.1,
        unit: "kW"
      }
    }
  });

  assert.equal(normalized.device_id, "heat-pump-001");
  assert.equal(normalized.device_type, "heat_pump");
  assert.equal(normalized.readings.heat_pump_power_kw.value, 2.1);
  assert.equal(validateTelemetry(normalized).valid, true);
});

test("POST /api/ingest accepts compatible simulator telemetry shape", async () => {
  const messages = [];
  const app = createApp({
    producer: {
      send: async (payload) => messages.push(payload)
    }
  });

  const response = await request(app, "POST", "/api/ingest", {
    communityId: "community-dublin-north",
    householdId: "household-compat",
    deviceId: "heat-pump-001",
    deviceType: "heat_pump",
    timestamp: "2026-05-25T12:00:00Z",
    data: {
      heat_pump_power_kw: {
        value: 2.1,
        unit: "kW"
      }
    }
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.compatibility_mode, true);
  assert.equal(messages.length, 1);
  const published = JSON.parse(messages[0].messages[0].value);
  assert.equal(published.device_id, "heat-pump-001");
  assert.equal(published.readings.heat_pump_power_kw.value, 2.1);
});

test("scale metadata is accepted without becoming a telemetry reading", () => {
  const payload = {
    message_id: "message-scale-001",
    correlation_id: "correlation-scale-001",
    reading_ids: {
      active_power_kw: "reading-scale-001"
    },
    household_id: "scale-household-001",
    community_id: "community-dublin-north",
    device_id: "scale-household-001-smart-meter-01",
    device_type: "smart_meter",
    timestamp: "2026-07-27T10:00:00.000Z",
    readings: {
      active_power_kw: { value: 2.5, unit: "kW" }
    },
    metadata: {
      household_profile: "standard_home",
      time_zone: "Europe/Dublin",
      operating_state: "monitoring",
      measurement_capabilities: ["active_power_kw", "energy_import_kwh"],
      selected_primary_field: "active_power_kw",
      reporting_offset_ms: 42,
      simulated: true,
      no_real_execution: true
    },
    protocol: "http",
    source: "scale-smart_meter-simulator"
  };

  const result = validateTelemetry(payload);
  assert.equal(result.valid, true);
  assert.equal(Object.keys(payload.readings).length, 1);
});

test("full-field coverage metadata accepts a null primary measurement", () => {
  const payload = loadSamplePayload();
  payload.metadata = {
    selected_primary_field: null,
    current_primary_measurement: null,
    measurement_capabilities: Object.keys(payload.readings),
    simulated: true,
    no_real_execution: true
  };

  const result = validateTelemetry(payload);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("reading idempotency keys must correspond to supplied readings", () => {
  const payload = loadSamplePayload();
  payload.reading_ids = {
    missing_reading: "reading-scale-missing"
  };

  const result = validateTelemetry(payload);

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.path === "reading_ids.missing_reading"),
    true
  );
});
