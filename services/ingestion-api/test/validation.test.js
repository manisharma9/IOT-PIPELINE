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
