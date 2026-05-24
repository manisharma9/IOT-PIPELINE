"use strict";

const express = require("express");
const {
  createPool,
  ensureIeee20305EventsTable,
  insertIeee20305Event
} = require("./db");
const {
  createKafka,
  publishGridSignal,
  startSemanticConsumer
} = require("./kafka");
const { translateGridSignal, validateGridSignal } = require("./translator");

const PORT = Number(process.env.IEEE20305_TRANSLATOR_PORT || process.env.PORT || 3002);
const SEMANTIC_ENRICHED_TOPIC = process.env.SEMANTIC_ENRICHED_TOPIC || "semantic.enriched";
const IEEE20305_TRANSLATED_TOPIC =
  process.env.IEEE20305_TRANSLATED_TOPIC || "ieee20305.translated";
const GRID_SIGNALS_TOPIC = process.env.GRID_SIGNALS_TOPIC || "grid.signals";
const TRANSLATOR_GROUP_ID =
  process.env.IEEE20305_TRANSLATOR_GROUP_ID || "ieee20305-translator";
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";

function createApp({
  pool,
  producer,
  gridSignalsTopic = GRID_SIGNALS_TOPIC,
  translatedTopic = IEEE20305_TRANSLATED_TOPIC
} = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "ieee20305-translator",
      consumes: SEMANTIC_ENRICHED_TOPIC,
      publishes: {
        telemetry: translatedTopic,
        grid_signals: gridSignalsTopic
      }
    });
  });

  app.post("/dso/grid-signal", async (request, response) => {
    const validation = validateGridSignal(request.body);
    if (!validation.valid) {
      return response.status(400).json({
        error: "invalid_grid_signal",
        message: "Grid signal payload failed validation.",
        details: validation.errors
      });
    }

    const translation = translateGridSignal(request.body, {
      sourceTopic: "http.post./dso/grid-signal",
      outputTopic: gridSignalsTopic
    });

    try {
      await insertIeee20305Event(pool, translation.event);
      await publishGridSignal(producer, gridSignalsTopic, translation.event);
    } catch (error) {
      console.error("DSO grid signal handling failed:", error);
      return response.status(503).json({
        error: "grid_signal_publish_failed",
        message: "Grid signal was valid but could not be stored or published."
      });
    }

    return response.status(202).json({
      status: "accepted",
      topic: gridSignalsTopic,
      resource_type: translation.event.resource_type,
      signal_id: request.body.signal_id,
      correlation_id: translation.event.correlation_id
    });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled IEEE 2030.5 translator API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected IEEE 2030.5 translator API error."
    });
  });

  return app;
}

async function start() {
  const kafka = createKafka();
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: TRANSLATOR_GROUP_ID });
  const pool = createPool();

  await ensureIeee20305EventsTable(pool);
  await producer.connect();
  await consumer.connect();

  const app = createApp({
    pool,
    producer,
    gridSignalsTopic: GRID_SIGNALS_TOPIC,
    translatedTopic: IEEE20305_TRANSLATED_TOPIC
  });

  const server = app.listen(PORT, () => {
    console.log(`IEEE 2030.5 translator listening on http://0.0.0.0:${PORT}`);
    console.log(`Consuming ${SEMANTIC_ENRICHED_TOPIC}`);
    console.log(`Publishing translated telemetry to ${IEEE20305_TRANSLATED_TOPIC}`);
    console.log(`Publishing mock DSO grid signals to ${GRID_SIGNALS_TOPIC}`);
  });

  await startSemanticConsumer({
    consumer,
    pool,
    producer,
    semanticTopic: SEMANTIC_ENRICHED_TOPIC,
    translatedTopic: IEEE20305_TRANSLATED_TOPIC
  });

  const shutdown = async () => {
    console.log("Shutting down IEEE 2030.5 translator...");
    server.close();
    await consumer.disconnect();
    await producer.disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("IEEE 2030.5 translator failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  start
};
