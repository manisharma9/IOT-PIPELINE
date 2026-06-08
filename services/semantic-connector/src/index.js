"use strict";

const { Kafka } = require("kafkajs");
const { createPool, ensureSemanticEventsTable, insertSemanticEvent } = require("./db");
const { getSaref4enerMapping } = require("./saref4ener-mapping");
const { getSlmConfig, isSlmEnabled, isSlmPrimaryEnabled, suggestSlmMapping } = require("./slm-mapper");
const { validateSlmMappingObject } = require("./slm-validation");
const {
  buildSemanticEvent,
  buildSemanticPayload,
  validateNormalizedTelemetryEvent
} = require("./semantic-builder");

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "adflex-semantic-connector";
const SEMANTIC_CONNECTOR_GROUP_ID =
  process.env.SEMANTIC_CONNECTOR_GROUP_ID || "saref4ener-semantic-connector";
const NORMALIZED_TELEMETRY_TOPIC =
  process.env.NORMALIZED_TELEMETRY_TOPIC || "normalized.telemetry";
const SEMANTIC_ENRICHED_TOPIC = process.env.SEMANTIC_ENRICHED_TOPIC || "semantic.enriched";

function buildKafkaMetadata(topic, partition, message) {
  return {
    topic,
    partition,
    offset: message.offset ? Number(message.offset) : null
  };
}

function buildSemanticMessageKey(event) {
  return [event.community_id, event.household_id, event.device_id, event.reading_name].join("/");
}

async function publishSemanticEvent(producer, topic, semanticEvent) {
  if (!producer || typeof producer.send !== "function") {
    return;
  }

  await producer.send({
    topic,
    messages: [
      {
        key: buildSemanticMessageKey(semanticEvent),
        value: JSON.stringify(semanticEvent),
        headers: semanticEvent.correlation_id
          ? { correlation_id: semanticEvent.correlation_id }
          : undefined
      }
    ]
  });
}

async function resolveSemanticMapping(
  event,
  options = {}
) {
  const slmConfig = options.slmConfig || getSlmConfig(options.env || process.env);
  const slmEnabled = options.slmEnabled ?? slmConfig.enabled;
  const slmPrimary = options.slmPrimary ?? slmConfig.primary ?? isSlmPrimaryEnabled();
  const slmMinConfidence = options.slmMinConfidence || slmConfig.minConfidence;
  const slmModel = options.slmModel || slmConfig.model;
  const slmMapper = options.slmMapper || suggestSlmMapping;
  const deterministicMapping = getSaref4enerMapping(event.reading_name);

  const fallbackToDeterministic = (fallbackReason) => {
    const fallbackMapping =
      deterministicMapping.mapping_source === "unmapped"
        ? deterministicMapping
        : {
            ...deterministicMapping,
            mapping_source: "deterministic_fallback"
          };

    return {
      ...fallbackMapping,
      slm_called: Boolean(slmEnabled && slmPrimary),
      slm_model: slmEnabled && slmPrimary ? slmModel : null,
      slm_confidence: null,
      fallback_reason: fallbackReason,
      deterministic_validation:
        deterministicMapping.mapping_source === "unmapped" ? "not_available" : "fallback_used",
      validation_source:
        deterministicMapping.mapping_source === "unmapped" ? "unmapped" : "deterministic_fallback"
    };
  };

  if (!slmEnabled) {
    return fallbackToDeterministic("slm_disabled");
  }

  if (!slmPrimary) {
    return fallbackToDeterministic("slm_primary_disabled");
  }

  let slmOutput;
  try {
    slmOutput = await slmMapper(event);
  } catch (error) {
    console.warn(
      `SLM primary mapping failed for ${event.reading_name}; using deterministic fallback: ${error.message}`
    );
    return fallbackToDeterministic("slm_mapper_error");
  }

  if (!slmOutput) {
    console.warn(
      `SLM primary mapping unavailable for ${event.reading_name}; using deterministic fallback`
    );
    return fallbackToDeterministic("slm_unavailable");
  }

  const validation = validateSlmMappingObject(slmOutput, {
    event,
    deterministicMapping,
    minConfidence: slmMinConfidence
  });

  if (!validation.valid) {
    console.warn(
      `SLM primary mapping rejected for ${event.reading_name}; using deterministic fallback: ${validation.errors.join("; ")}`
    );
    return fallbackToDeterministic(`slm_rejected:${validation.errors.join("; ")}`);
  }

  return {
    ...validation.mapping,
    mapping_source: "slm_primary",
    slm_called: true,
    slm_model: slmModel,
    slm_confidence: validation.mapping.slm_confidence,
    fallback_reason: null
  };
}

async function processNormalizedTelemetryMessage({
  topic,
  partition,
  message,
  pool,
  producer,
  semanticTopic = SEMANTIC_ENRICHED_TOPIC,
  slmEnabled = isSlmEnabled(),
  slmPrimary = isSlmPrimaryEnabled(),
  slmMapper = suggestSlmMapping
}) {
  const metadata = buildKafkaMetadata(topic, partition, message);
  const rawMessage = message.value ? message.value.toString("utf8") : "";
  let event;

  try {
    event = JSON.parse(rawMessage);
  } catch (error) {
    console.warn(
      `Skipping normalized telemetry at ${metadata.topic}:${metadata.partition}:${metadata.offset}; invalid JSON: ${error.message}`
    );
    return {
      status: "error",
      error: error.message
    };
  }

  const validation = validateNormalizedTelemetryEvent(event);
  if (!validation.valid) {
    const messageText = validation.errors.join("; ");
    console.warn(
      `Skipping normalized telemetry at ${metadata.topic}:${metadata.partition}:${metadata.offset}; ${messageText}`
    );
    return {
      status: "error",
      error: messageText
    };
  }

  const mapping = await resolveSemanticMapping(event, {
    slmEnabled,
    slmPrimary,
    slmMapper
  });
  const semanticPayload = buildSemanticPayload(event, mapping);
  const semanticEvent = buildSemanticEvent(event, mapping, semanticPayload);

  await insertSemanticEvent(pool, semanticEvent);
  await publishSemanticEvent(producer, semanticTopic, semanticEvent);

  console.log(
    `Semantic connector enriched ${event.reading_name} for ${event.device_id} using ${mapping.mapping_source} mapping`
  );

  return {
    status: "processed",
    mapping_source: mapping.mapping_source,
    slm_confidence: mapping.slm_confidence || null,
    fallback_reason: mapping.fallback_reason || null,
    topic: semanticTopic
  };
}

async function start() {
  const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS
  });
  const consumer = kafka.consumer({ groupId: SEMANTIC_CONNECTOR_GROUP_ID });
  const producer = kafka.producer();
  const pool = createPool();

  await ensureSemanticEventsTable(pool);
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({
    topic: NORMALIZED_TELEMETRY_TOPIC,
    fromBeginning: process.env.KAFKA_FROM_BEGINNING === "true"
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        await processNormalizedTelemetryMessage({
          topic,
          partition,
          message,
          pool,
          producer,
          semanticTopic: SEMANTIC_ENRICHED_TOPIC
        });
      } catch (error) {
        console.error("Semantic connector failed to process a message:", error);
      }
    }
  });

  const shutdown = async () => {
    console.log("Shutting down semantic connector...");
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
    console.error("Semantic connector failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  buildKafkaMetadata,
  buildSemanticMessageKey,
  resolveSemanticMapping,
  processNormalizedTelemetryMessage
};
