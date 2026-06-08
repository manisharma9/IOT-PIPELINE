"use strict";

const express = require("express");
const {
  HEAT_PUMP_ACTIONS,
  createHeatPumpDevice
} = require("../../common/simulators");

const PORT = Number(process.env.HEAT_PUMP_SIMULATOR_PORT || process.env.PORT || 3011);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";
const DEVICE_ID = process.env.HEAT_PUMP_SIMULATOR_DEVICE_ID || "heat-pump-001";
const DEVICE_TYPE = "heat_pump";
const VALID_ACTIONS = HEAT_PUMP_ACTIONS;

function createResponse(action, body = {}, timestamp = new Date().toISOString(), device) {
  const simulator = device || createHeatPumpDevice({ deviceId: body.device_id || DEVICE_ID });
  const result = simulator.applyCommand(action, body, timestamp);

  return {
    ...result,
    device_id: body.device_id || DEVICE_ID,
    device_type: DEVICE_TYPE,
    execution_mode: "simulated_heat_pump_api"
  };
}

function createApp(options = {}) {
  const app = express();
  const device = options.device || createHeatPumpDevice({ deviceId: DEVICE_ID });

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "heat-pump-simulator",
      device_id: DEVICE_ID,
      device_type: DEVICE_TYPE,
      simulator_contract: ["tick", "getTelemetry"],
      simulated: true,
      real_device_control: false
    });
  });

  app.get("/heat-pump/status", (_request, response) => {
    response.json({
      status: "ok",
      ...device.tick()
    });
  });

  app.get("/heat-pump/telemetry", (_request, response) => {
    response.json({
      status: "ok",
      telemetry: device.getTelemetry()
    });
  });

  app.post("/heat-pump/command", (request, response) => {
    const action = request.body && request.body.action;
    if (!VALID_ACTIONS.includes(action)) {
      return response.status(400).json({
        error: "unsupported_heat_pump_action",
        supported_actions: VALID_ACTIONS,
        simulated: true,
        no_real_execution: true
      });
    }

    return response
      .status(202)
      .json(createResponse(action, request.body, new Date().toISOString(), device));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled heat pump simulator error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected heat pump simulator error."
    });
  });

  return app;
}

function start() {
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`Heat pump simulator listening on http://0.0.0.0:${PORT}`);
    console.log("Real heat pump device control is disabled.");
  });

  const shutdown = () => {
    console.log("Shutting down heat pump simulator...");
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
