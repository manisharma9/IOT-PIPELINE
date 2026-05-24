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

test("Enode simulator health", async () => {
  const response = await request(createApp(), "GET", "/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.service, "enode-simulator");
  assert.equal(response.body.provider, "enode");
  assert.equal(response.body.real_device_control, false);
});

test("Enode simulator command accepted", async () => {
  const response = await request(createApp(), "POST", "/enode/chargers/easee-core-001/command", {
    action: "reduce_charging_power",
    requested_reduction_kw: 2.5
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.charger_id, "easee-core-001");
  assert.equal(response.body.provider, "enode");
  assert.equal(response.body.charger_type, "easee_core");
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.simulated, true);
  assert.equal(response.body.no_real_execution, true);
});
