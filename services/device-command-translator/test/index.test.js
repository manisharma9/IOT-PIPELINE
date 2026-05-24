"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createApp } = require("../src/index");

function request(app, method, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();

      fetch(`http://127.0.0.1:${port}${path}`, { method })
        .then(async (response) => {
          const json = await response.json();
          resolve({ status: response.status, body: json });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

test("device command translator health endpoint works", async () => {
  const response = await request(createApp(), "GET", "/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.service, "device-command-translator");
  assert.equal(response.body.real_device_control, false);
  assert.equal(response.body.no_real_execution, true);
  assert.ok(response.body.supported_devices.some((device) => device.device_id === "shelly-plug-001"));
  assert.ok(response.body.supported_devices.some((device) => device.device_id === "easee-core-001"));
});

test("device command translator audit endpoint returns safe response", async () => {
  const pool = {
    query: async () => ({
      rows: [
        {
          id: 1,
          event_time: "2026-05-25T10:00:00.000Z",
          command_id: "cmd-1",
          proposal_id: "proposal-1",
          device_id: "shelly-plug-001",
          device_type: "shelly_plug",
          provider: "shelly",
          community_id: "community-dublin-north",
          area_id: "dublin-north",
          requested_reduction_kw: 2.5,
          allocated_reduction_kw: 1,
          action: "reduce_load",
          translated_command: {},
          simulated_response: {},
          execution_mode: "simulated_device_api",
          no_real_execution: true,
          status: "simulated_accepted",
          correlation_id: "corr-1",
          created_at: "2026-05-25T10:00:00.000Z"
        }
      ]
    })
  };
  const response = await request(createApp({ pool }), "GET", "/device-command/audit");

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.audit[0].no_real_execution, true);
});
