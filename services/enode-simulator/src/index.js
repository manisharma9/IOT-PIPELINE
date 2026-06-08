"use strict";

const express = require("express");
const {
  ENODE_ACTIONS,
  createEnodeEaseeDevice
} = require("../../common/simulators");

const PORT = Number(process.env.ENODE_SIMULATOR_PORT || process.env.PORT || 3008);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";
const DEFAULT_CHARGER_ID = process.env.ENODE_SIMULATOR_CHARGER_ID || "easee-core-001";
const VALID_ACTIONS = ENODE_ACTIONS;

function createResponse(chargerId, action, body = {}, timestamp = new Date().toISOString(), device) {
  const simulator = device || createEnodeEaseeDevice({ deviceId: chargerId || DEFAULT_CHARGER_ID });
  const result = simulator.applyCommand(action, { ...body, charger_id: chargerId }, timestamp);

  return {
    ...result,
    execution_mode: "simulated_enode_api",
    charger_id: chargerId || DEFAULT_CHARGER_ID,
    charger_type: "easee_core"
  };
}

function createApp(options = {}) {
  const app = express();
  const device = options.device || createEnodeEaseeDevice({ deviceId: DEFAULT_CHARGER_ID });

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "enode-simulator",
      provider: "enode",
      charger_type: "easee_core",
      simulator_contract: ["tick", "getTelemetry"],
      simulated: true,
      real_device_control: false
    });
  });

  app.get("/enode/chargers", (_request, response) => {
    response.json({
      status: "ok",
      chargers: [
        {
          charger_id: DEFAULT_CHARGER_ID,
          provider: "enode",
          charger_type: "easee_core",
          online: true,
          simulated: true,
          no_real_execution: true,
          telemetry: device.getTelemetry()
        }
      ]
    });
  });

  app.get("/enode/chargers/:chargerId/telemetry", (_request, response) => {
    response.json({
      status: "ok",
      telemetry: device.getTelemetry()
    });
  });

  app.post("/enode/chargers/:chargerId/command", (request, response) => {
    const action = request.body && request.body.action;
    if (!VALID_ACTIONS.includes(action)) {
      return response.status(400).json({
        error: "unsupported_enode_action",
        supported_actions: VALID_ACTIONS,
        simulated: true,
        no_real_execution: true
      });
    }

    return response
      .status(202)
      .json(createResponse(request.params.chargerId, action, request.body, new Date().toISOString(), device));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled Enode simulator error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected Enode simulator error."
    });
  });

  return app;
}

function start() {
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`Enode simulator listening on http://0.0.0.0:${PORT}`);
    console.log("Real Enode/Easee device control is disabled.");
  });

  const shutdown = () => {
    console.log("Shutting down Enode simulator...");
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
