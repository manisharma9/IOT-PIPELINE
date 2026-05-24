"use strict";

const express = require("express");
const {
  buildAuditPayload,
  buildExportPayload,
  buildFullPipelineDemoPayload
} = require("./export-builder");
const {
  createPool,
  ensureDataspaceExportsTable,
  getApprovalAuditSummary,
  getDispatchProposalSummary,
  getFullPipelineDemoSummary,
  getGridSignalSummary,
  getMockDispatchSummary,
  getSemanticSummary,
  safeInsertExportAudit
} = require("./db");
const { createKafka, publishCatalogEvent, publishExportAudit } = require("./kafka");
const {
  ACCESS_POLICY,
  buildCatalogMetadata,
  getAssetByExportType,
  getAssetById,
  getAssets,
  normalizeMaxRecords,
  normalizeRequestedLimit
} = require("./policy");

const PORT = Number(process.env.DATASPACE_EXPORT_PORT || process.env.PORT || 3006);
const CATALOG_TOPIC = process.env.DATASPACE_CATALOG_TOPIC || "dataspace.catalog";
const EXPORT_AUDIT_TOPIC = process.env.DATASPACE_EXPORT_AUDIT_TOPIC || "dataspace.export.audit";
const DEFAULT_COMMUNITY = process.env.DATASPACE_DEFAULT_COMMUNITY || "community-dublin-north";
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "256kb";

const EXPORT_HANDLERS = Object.freeze({
  semantic_summary: getSemanticSummary,
  grid_signal_summary: getGridSignalSummary,
  dispatch_proposal_summary: getDispatchProposalSummary,
  approval_audit_summary: getApprovalAuditSummary,
  mock_dispatch_summary: getMockDispatchSummary
});

function requireApiKey(apiKey) {
  return (request, response, next) => {
    if (!apiKey || request.get("x-api-key") !== apiKey) {
      return response.status(401).json({
        error: "unauthorized_dataspace_request",
        message: "A valid x-api-key header is required for dataspace export endpoints."
      });
    }

    return next();
  };
}

function requesterFromRequest(request) {
  return {
    requester_id: request.get("x-requester-id") || "local-demo-client",
    requester_role: request.get("x-requester-role") || "dataspace_demo"
  };
}

function buildCorrelationId(assetId, generatedAt) {
  return `dataspace-${assetId}-${Date.parse(generatedAt) || Date.now()}`;
}

function buildAuditEvent({ payload, requester, assetId, correlationId, status = "exported" }) {
  const auditPayload = buildAuditPayload({
    payload,
    requester,
    assetId,
    correlationId,
    status
  });

  return {
    event_time: payload.generated_at,
    created_at: payload.generated_at,
    export_type: payload.export_type,
    requester_id: requester.requester_id,
    requester_role: requester.requester_role,
    community_id: payload.community_id,
    asset_id: assetId,
    record_count: payload.record_count,
    access_policy: payload.access_policy,
    minimization_applied: true,
    pseudonymization_applied: true,
    export_status: status,
    export_payload: payload,
    audit_payload: auditPayload,
    correlation_id: correlationId
  };
}

async function storeAndPublishAudit({ pool, producer, auditEvent }) {
  await safeInsertExportAudit(pool, auditEvent);
  await publishExportAudit(producer, EXPORT_AUDIT_TOPIC, auditEvent.audit_payload);
}

function createExportRoute({ exportType, pool, producer, salt, maxRecords }) {
  return async (request, response) => {
    const asset = getAssetByExportType(exportType);
    const communityId = request.query.community_id || DEFAULT_COMMUNITY;
    const limit = normalizeRequestedLimit(request.query.limit, maxRecords);
    const generatedAt = new Date().toISOString();
    const requester = requesterFromRequest(request);

    try {
      const rows = await EXPORT_HANDLERS[exportType](pool, {
        communityId,
        limit,
        maxRecords
      });
      const payload = buildExportPayload({
        exportType,
        communityId,
        rows,
        salt,
        generatedAt,
        maxRecords: limit
      });
      const correlationId = buildCorrelationId(asset.id, generatedAt);
      const auditEvent = buildAuditEvent({
        payload,
        requester,
        assetId: asset.id,
        correlationId
      });

      await storeAndPublishAudit({ pool, producer, auditEvent });

      return response.json(payload);
    } catch (error) {
      console.error(`Could not build dataspace export ${exportType}:`, error);
      return response.status(503).json({
        error: "dataspace_export_unavailable",
        message: "The requested dataspace export could not be built."
      });
    }
  };
}

function createApp({
  pool,
  producer,
  apiKey = process.env.DATASPACE_API_KEY,
  salt = process.env.DATASPACE_PSEUDONYMIZATION_SALT || "",
  maxRecords = normalizeMaxRecords(process.env.DATASPACE_MAX_RECORDS)
} = {}) {
  const app = express();
  const apiKeyMiddleware = requireApiKey(apiKey);

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "dataspace-export",
      foundation_only: true,
      enershare_certified_connector: false,
      api_key_required_for_exports: true,
      minimization_applied: true,
      pseudonymization_applied: true,
      topics: {
        catalog: CATALOG_TOPIC,
        audit: EXPORT_AUDIT_TOPIC
      }
    });
  });

  app.get("/dataspace/catalog", (_request, response) => {
    response.json(buildCatalogMetadata());
  });

  app.get("/dataspace/assets", (_request, response) => {
    response.json({
      status: "ok",
      access_policy: ACCESS_POLICY,
      assets: getAssets()
    });
  });

  app.get("/dataspace/assets/:assetId", (request, response) => {
    const asset = getAssetById(request.params.assetId);
    if (!asset) {
      return response.status(404).json({
        error: "dataspace_asset_not_found"
      });
    }

    return response.json({
      status: "ok",
      asset
    });
  });

  app.get(
    "/dataspace/export/semantic-summary",
    apiKeyMiddleware,
    createExportRoute({ exportType: "semantic_summary", pool, producer, salt, maxRecords })
  );
  app.get(
    "/dataspace/export/grid-signal-summary",
    apiKeyMiddleware,
    createExportRoute({ exportType: "grid_signal_summary", pool, producer, salt, maxRecords })
  );
  app.get(
    "/dataspace/export/dispatch-proposal-summary",
    apiKeyMiddleware,
    createExportRoute({
      exportType: "dispatch_proposal_summary",
      pool,
      producer,
      salt,
      maxRecords
    })
  );
  app.get(
    "/dataspace/export/approval-audit-summary",
    apiKeyMiddleware,
    createExportRoute({ exportType: "approval_audit_summary", pool, producer, salt, maxRecords })
  );
  app.get(
    "/dataspace/export/mock-dispatch-summary",
    apiKeyMiddleware,
    createExportRoute({ exportType: "mock_dispatch_summary", pool, producer, salt, maxRecords })
  );

  app.get("/dataspace/export/full-pipeline-demo-summary", apiKeyMiddleware, async (request, response) => {
    const communityId = request.query.community_id || DEFAULT_COMMUNITY;
    const limit = normalizeRequestedLimit(request.query.limit, maxRecords);
    const generatedAt = new Date().toISOString();
    const requester = requesterFromRequest(request);
    const asset = getAssetByExportType("full_pipeline_demo_summary");

    try {
      const rows = await getFullPipelineDemoSummary(pool, {
        communityId,
        limit,
        maxRecords
      });
      const payload = buildFullPipelineDemoPayload({
        communityId,
        rows,
        salt,
        generatedAt,
        maxRecords: limit
      });
      const correlationId = buildCorrelationId(asset.id, generatedAt);
      const auditEvent = buildAuditEvent({
        payload,
        requester,
        assetId: asset.id,
        correlationId
      });

      await storeAndPublishAudit({ pool, producer, auditEvent });

      return response.json(payload);
    } catch (error) {
      console.error("Could not build full pipeline dataspace export:", error);
      return response.status(503).json({
        error: "dataspace_export_unavailable",
        message: "The full pipeline demo summary could not be built."
      });
    }
  });

  app.post("/dataspace/catalog/publish", apiKeyMiddleware, async (request, response) => {
    const generatedAt = new Date().toISOString();
    const requester = requesterFromRequest(request);
    const catalogPayload = buildCatalogMetadata({ generatedAt });
    const correlationId = buildCorrelationId("catalog", generatedAt);
    const auditPayload = {
      event_time: generatedAt,
      export_type: "catalog_publish",
      requester_id: requester.requester_id,
      requester_role: requester.requester_role,
      community_id: DEFAULT_COMMUNITY,
      asset_id: "catalog",
      record_count: catalogPayload.assets.length,
      access_policy: ACCESS_POLICY,
      minimization_applied: true,
      pseudonymization_applied: true,
      export_status: "published",
      no_raw_private_payloads: true,
      correlation_id: correlationId,
      message: "Dataspace catalog metadata published to Kafka."
    };
    const auditEvent = {
      event_time: generatedAt,
      created_at: generatedAt,
      export_type: "catalog_publish",
      requester_id: requester.requester_id,
      requester_role: requester.requester_role,
      community_id: DEFAULT_COMMUNITY,
      asset_id: "catalog",
      record_count: catalogPayload.assets.length,
      access_policy: ACCESS_POLICY,
      minimization_applied: true,
      pseudonymization_applied: true,
      export_status: "published",
      export_payload: catalogPayload,
      audit_payload: auditPayload,
      correlation_id: correlationId
    };

    try {
      await publishCatalogEvent(producer, CATALOG_TOPIC, catalogPayload);
      await storeAndPublishAudit({ pool, producer, auditEvent });

      return response.status(202).json({
        status: "accepted",
        topic: CATALOG_TOPIC,
        catalog: catalogPayload
      });
    } catch (error) {
      console.error("Could not publish dataspace catalog:", error);
      return response.status(503).json({
        error: "dataspace_catalog_publish_failed",
        message: "Dataspace catalog metadata could not be published."
      });
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({
        error: "invalid_json",
        message: "Request body must be valid JSON."
      });
    }

    console.error("Unhandled dataspace export API error:", error);
    return response.status(500).json({
      error: "internal_error",
      message: "Unexpected dataspace export API error."
    });
  });

  return app;
}

async function start() {
  const pool = createPool();
  const kafka = createKafka();
  const producer = kafka.producer();

  await ensureDataspaceExportsTable(pool);
  await producer.connect();

  const app = createApp({ pool, producer });
  const server = app.listen(PORT, () => {
    console.log(`Dataspace export service listening on http://0.0.0.0:${PORT}`);
    console.log(`Catalog topic: ${CATALOG_TOPIC}`);
    console.log(`Export audit topic: ${EXPORT_AUDIT_TOPIC}`);
    console.log("Exports are minimized and pseudonymized. This is not a certified ENERSHARE connector.");
  });

  const shutdown = async () => {
    console.log("Shutting down dataspace export service...");
    server.close();
    await producer.disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Dataspace export service failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  buildAuditEvent,
  createApp,
  requireApiKey,
  start
};
