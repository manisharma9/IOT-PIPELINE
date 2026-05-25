"use strict";

const express = require("express");
const { buildAuditEvent, createAuditRecorder } = require("./audit");
const { loadConfig } = require("./config");
const {
  createPool,
  ensureSecurityGatewayAuditTable,
  listSecurityGatewayAudit,
  safeInsertSecurityGatewayAudit
} = require("./db");
const { createKafka, publishSecurityGatewayAudit } = require("./kafka");
const { findRoute, proxyRequest, resolveRoute } = require("./proxy");
const {
  buildCorsHeaders,
  checkIpAccess,
  checkRateLimit,
  generateCorrelationId,
  getClientIp,
  inspectPayload,
  isJsonContentType,
  validateApiKey,
  validateJwtReady
} = require("./security");

function noOpAuditRecorder() {
  return {
    async record() {}
  };
}

async function rejectRequest(request, response, auditRecorder, details) {
  const {
    statusCode,
    error,
    decision = "blocked",
    reason = error,
    targetService = null,
    auditPayload = {}
  } = details;

  const auditEvent = buildAuditEvent({
    request,
    decision,
    reason,
    statusCode,
    targetService,
    auditPayload
  });
  await auditRecorder.record(auditEvent);

  return response.status(statusCode).json({
    error,
    reason,
    correlation_id: request.correlationId
  });
}

function applySecurityHeaders(response, config, origin) {
  response.set("x-content-type-options", "nosniff");
  response.set("cache-control", "no-store");
  response.set("pragma", "no-cache");
  response.set("x-frame-options", "DENY");
  response.set(buildCorsHeaders(config, origin));
}

async function readDownstreamHealth(config, healthFetch = fetch) {
  const downstream = [
    ["ingestion-api", `${config.targets.ingestion}/health`],
    ["ieee20305-translator", `${config.targets.ieee20305}/health`],
    ["aggregator", `${config.targets.aggregator}/health`],
    ["approval-workflow", `${config.targets.approval}/health`],
    ["mock-dispatch-adapter", `${config.targets.mockDispatch}/health`],
    ["dataspace-export", `${config.targets.dataspace}/health`],
    ["device-command-translator", `${config.targets.deviceCommand}/health`]
  ];

  const results = [];
  for (const [service, url] of downstream) {
    try {
      const response = await healthFetch(url, { method: "GET" });
      results.push({
        service,
        status: response.ok ? "ok" : "degraded",
        status_code: response.status
      });
    } catch (error) {
      results.push({
        service,
        status: "unavailable",
        message: error.message
      });
    }
  }

  return results;
}

function createApp(options = {}) {
  const config = options.config || loadConfig();
  const auditRecorder = options.auditRecorder || noOpAuditRecorder();
  const proxyFetch = options.proxyFetch || fetch;
  const healthFetch = options.healthFetch || proxyFetch;
  const rateLimitStore = options.rateLimitStore || new Map();
  const app = express();

  app.set("trust proxy", true);

  app.use((request, response, next) => {
    request.correlationId = request.get("x-correlation-id") || generateCorrelationId();
    request.clientIp = getClientIp(request);
    request.authMode = config.jwtAuthEnabled ? "api_key_and_jwt" : "api_key";
    applySecurityHeaders(response, config, request.get("origin") || "");
    response.set("x-correlation-id", request.correlationId);

    if (request.method === "OPTIONS") {
      return response.status(204).send();
    }

    return next();
  });

  app.get("/health", async (request, response) => {
    await auditRecorder.record(buildAuditEvent({
      request,
      decision: "accepted",
      reason: "gateway_health",
      statusCode: 200,
      targetService: "security-gateway",
      authMode: "none"
    }));
    response.json({
      status: "ok",
      service: "security-gateway",
      port: config.port,
      external_entry_point: true,
      api_key_required: true,
      jwt_auth_enabled: config.jwtAuthEnabled,
      real_device_control: false
    });
  });

  app.get("/edge/health", async (request, response) => {
    const downstream = await readDownstreamHealth(config, healthFetch);
    await auditRecorder.record(buildAuditEvent({
      request,
      decision: downstream.every((item) => item.status === "ok") ? "accepted" : "downstream_error",
      reason: "edge_health",
      statusCode: 200,
      targetService: "security-gateway",
      authMode: "none",
      auditPayload: {
        downstream
      }
    }));
    response.json({
      status: downstream.every((item) => item.status === "ok") ? "ok" : "degraded",
      service: "security-gateway",
      downstream
    });
  });

  app.use(async (request, response, next) => {
    const route = findRoute(request.path);
    if (route && !route.methods.includes(request.method)) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 405,
        error: "unsupported_http_method",
        reason: "unsupported_http_method",
        decision: "blocked",
        targetService: route.name
      });
    }
    return next();
  });

  app.use(async (request, response, next) => {
    if (!isJsonContentType(request)) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 415,
        error: "unsupported_content_type",
        reason: "json_content_type_required",
        decision: "blocked"
      });
    }
    return next();
  });

  app.use(async (request, response, next) => {
    const validation = validateApiKey(request, config);
    request.edgeApiKeyId = validation.apiKeyId;
    if (!validation.valid) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 401,
        error: "unauthorized_edge_request",
        reason: validation.reason,
        decision: "unauthorized"
      });
    }
    return next();
  });

  app.use(async (request, response, next) => {
    const jwt = validateJwtReady(request, config);
    request.authMode = jwt.authMode;
    if (!jwt.valid) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 401,
        error: "unauthorized_edge_request",
        reason: jwt.reason,
        decision: "unauthorized"
      });
    }
    return next();
  });

  app.use(async (request, response, next) => {
    const rateLimit = checkRateLimit(request.clientIp, config, rateLimitStore);
    response.set("x-ratelimit-remaining", String(rateLimit.remaining || 0));
    if (!rateLimit.allowed) {
      response.set("retry-after", String(Math.ceil(rateLimit.retryAfterMs / 1000)));
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 429,
        error: "rate_limit_exceeded",
        reason: "rate_limit_exceeded",
        decision: "rate_limited"
      });
    }
    return next();
  });

  app.use(async (request, response, next) => {
    const ipAccess = checkIpAccess(request.clientIp, config);
    if (!ipAccess.allowed) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 403,
        error: "edge_request_forbidden",
        reason: ipAccess.reason,
        decision: "blocked"
      });
    }
    return next();
  });

  app.use(express.json({
    limit: config.requestBodyLimit,
    verify: (request, _response, buffer) => {
      request.rawBody = buffer.toString("utf8");
    }
  }));

  app.use(async (error, request, response, next) => {
    if (error && error.type === "entity.too.large") {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 413,
        error: "payload_too_large",
        reason: "oversized_payload",
        decision: "blocked"
      });
    }

    if (error instanceof SyntaxError && "body" in error) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 400,
        error: "invalid_json",
        reason: "invalid_json",
        decision: "blocked"
      });
    }

    return next(error);
  });

  app.use(async (request, response, next) => {
    const inspection = inspectPayload(request.rawBody || "", request.originalUrl);
    if (!inspection.allowed) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 403,
        error: "blocked_by_request_inspection",
        reason: inspection.reason,
        decision: "blocked"
      });
    }
    return next();
  });

  app.get("/security/audit", async (request, response) => {
    try {
      const audit = await listSecurityGatewayAudit(config.auditPool || options.auditPool, {
        limit: request.query.limit,
        correlationId: request.query.correlation_id,
        decision: request.query.decision
      });

      await auditRecorder.record(buildAuditEvent({
        request,
        decision: "accepted",
        reason: "security_audit_read",
        statusCode: 200,
        targetService: "security-gateway",
        auditPayload: {
          count: audit.length
        }
      }));

      return response.json({
        status: "ok",
        count: audit.length,
        audit
      });
    } catch (error) {
      console.error("Could not read security gateway audit rows:", error);
      return response.status(503).json({
        error: "security_gateway_audit_unavailable",
        message: "Security gateway audit rows could not be read safely.",
        correlation_id: request.correlationId
      });
    }
  });

  app.use(async (request, response) => {
    const route = resolveRoute(request.method, request.path);
    if (!route) {
      return rejectRequest(request, response, auditRecorder, {
        statusCode: 404,
        error: "route_not_found",
        reason: "unknown_route",
        decision: "blocked"
      });
    }

    try {
      const proxyResult = await proxyRequest({
        request,
        response,
        route,
        config,
        proxyFetch
      });
      const decision = proxyResult.statusCode >= 500 ? "downstream_error" : "accepted";
      const auditEvent = buildAuditEvent({
        request,
        decision,
        reason: decision === "accepted" ? "request_forwarded" : "downstream_error",
        statusCode: proxyResult.statusCode,
        targetService: proxyResult.targetService,
        auditPayload: {
          target_url: proxyResult.targetUrl
        }
      });
      await auditRecorder.record(auditEvent);
    } catch (error) {
      await rejectRequest(request, response, auditRecorder, {
        statusCode: 502,
        error: "downstream_service_error",
        reason: "downstream_error",
        decision: "downstream_error",
        auditPayload: {
          message: error.message
        }
      });
    }
  });

  return app;
}

async function start() {
  const config = loadConfig();
  const pool = createPool();
  const kafka = createKafka(config);
  const producer = kafka.producer();

  await ensureSecurityGatewayAuditTable(pool);
  await producer.connect();

  const auditRecorder = createAuditRecorder({
    pool,
    producer,
    insertAudit: safeInsertSecurityGatewayAudit,
    publishAudit: publishSecurityGatewayAudit,
    topic: config.auditTopic
  });
  const app = createApp({ config, auditRecorder, auditPool: pool });
  const server = app.listen(config.port, () => {
    console.log(`Security gateway listening on http://0.0.0.0:${config.port}`);
    console.log(`Publishing security audit events to ${config.auditTopic}`);
  });

  const shutdown = async () => {
    console.log("Shutting down security gateway...");
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
    console.error("Security gateway failed to start:", error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  readDownstreamHealth,
  rejectRequest,
  start
};
