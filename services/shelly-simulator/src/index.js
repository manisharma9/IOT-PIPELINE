"use strict";

const express = require("express");
const {
  SHELLY_ACTIONS,
  createShellyPlugDevice
} = require("../../common/simulators");

const PORT = Number(process.env.SHELLY_SIMULATOR_PORT || process.env.PORT || 3007);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";
const DEVICE_ID = process.env.SHELLY_SIMULATOR_DEVICE_ID || "shelly-plug-001";
const DEVICE_TYPE = "shelly_plug";
const VALID_ACTIONS = SHELLY_ACTIONS;

function createResponse(action, body = {}, timestamp = new Date().toISOString(), device) {
  const simulator = device || createShellyPlugDevice({ deviceId: body.device_id || DEVICE_ID });
  const result = simulator.applyCommand(action, body, timestamp);

  return {
    ...result,
    device_type: DEVICE_TYPE,
    execution_mode: "simulated_shelly_api"
  };
}

function createApp(options = {}) {
  const app = express();
  const device = options.device || createShellyPlugDevice({ deviceId: DEVICE_ID });

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "shelly-simulator",
      device_id: DEVICE_ID,
      device_type: DEVICE_TYPE,
      simulator_contract: ["tick", "getTelemetry"],
      simulated: true,
      real_device_control: false
    });
  });

  app.get("/shelly/status", (_request, response) => {
    const status = device.tick();
    response.json({
      status: "ok",
      ...status,
      device_id: DEVICE_ID,
      device_type: DEVICE_TYPE,
      relay_state: status.relay_state || "simulated_available"
    });
  });

  app.get("/shelly/telemetry", (_request, response) => {
    response.json({
      status: "ok",
      telemetry: device.getTelemetry()
    });
  });

  app.post("/shelly/plug/command", (request, response) => {
    const action = request.body && request.body.action;
    if (!VALID_ACTIONS.includes(action)) {
      return response.status(400).json({
        error: "unsupported_shelly_action",
        supported_actions: VALID_ACTIONS,
        simulated: true,
        no_real_execution: true
      });
    }

    return response.status(202).json(createResponse(action, request.body, new Date().toISOString(), device));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled Shelly simulator error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected Shelly simulator error."
    });
  });

  return app;
}

function start() {
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`Shelly simulator listening on http://0.0.0.0:${PORT}`);
    console.log("Real Shelly device control is disabled.");
  });

  const shutdown = () => {
    console.log("Shutting down Shelly simulator...");
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start();
}

module.exports = {
  VALID_ACTIONS,
  createApp,
  createResponse,
  start
};
