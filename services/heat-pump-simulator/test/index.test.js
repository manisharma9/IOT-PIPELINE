"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createApp } = require("../src/index");

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const payload = body ? JSON.stringify(body) : undefined;
      const options = {
        method,
        headers: payload
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload)
            }
          : undefined
      };

      fetch(`http://127.0.0.1:${port}${path}`, {
        ...options,
        body: payload
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

test("heat pump simulator health exposes BaseDevice-style contract", async () => {
  const response = await request(createApp(), "GET", "/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.service, "heat-pump-simulator");
  assert.deepEqual(response.body.simulator_contract, ["tick", "getTelemetry"]);
  assert.equal(response.body.real_device_control, false);
});

test("heat pump simulator telemetry uses compatible deviceId/data shape", async () => {
  const response = await request(createApp(), "GET", "/heat-pump/telemetry");

  assert.equal(response.status, 200);
  assert.equal(response.body.telemetry.deviceId, "heat-pump-001");
  assert.equal(response.body.telemetry.deviceType, "heat_pump");
  assert.ok(response.body.telemetry.timestamp);
  assert.ok(response.body.telemetry.data.heat_pump_power_kw);
  assert.ok(response.body.telemetry.readings.heat_pump_power_kw);
});

test("heat pump simulator command accepted", async () => {
  const response = await request(createApp(), "POST", "/heat-pump/command", {
    action: "reduce_load",
    requested_reduction_kw: 1.2
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.device_type, "heat_pump");
  assert.equal(response.body.action, "reduce_load");
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.simulated, true);
  assert.equal(response.body.no_real_execution, true);
});
