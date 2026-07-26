"use strict";

const express = require("express");
const { buildAuditEvent, createAuditRecorder } = require("./audit");
const { loadConfig } = require("./config");
const {
  createPool,
  ensureCustomerDashboardReadModel,
  ensureSecurityGatewayAuditTable,
  listSecurityGatewayAudit,
  safeInsertSecurityGatewayAudit
} = require("./db");
const {
  CustomerAccessError,
  readCustomerContext,
  resolveHouseholdScope
} = require("./customer-auth");
const customerReadModel = require("./customer-read-model");
const customerInsights = require("./customer-insights");
const { createKafka, publishSecurityGatewayAudit } = require("./kafka");
const { buildPlatformStatus, listScalabilityDevices } = require("./platform-status");
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
  const customerPool = options.auditPool || config.auditPool;
  const customerReader = options.customerReadModel || customerReadModel;
  const insightReader = options.customerInsights || customerInsights;
  const app = express();

  async function auditCustomerRead(request, reason, statusCode, extra = {}) {
    await auditRecorder.record(buildAuditEvent({
      request,
      decision: statusCode < 400 ? "accepted" : "blocked",
      reason,
      statusCode,
      targetService: "customer-read-model",
      auditPayload: {
        customer_role: extra.role || null,
        response_kind: extra.responseKind || null,
        no_raw_payload: true
      }
    }));
  }

  async function customerScope(request) {
    if (!customerPool) {
      throw new CustomerAccessError("customer_read_model_unavailable", 503);
    }
    const context = readCustomerContext(request);
    const householdId = await resolveHouseholdScope(
      customerPool,
      context,
      request.query.household_id,
      config.customerPseudonymizationSalt
    );
    if (!householdId) {
      throw new CustomerAccessError("customer_household_data_not_found", 404);
    }
    return { context, householdId };
  }

  async function sendCustomerError(request, response, error) {
    const statusCode = error instanceof CustomerAccessError
      ? error.statusCode
      : 503;
    const code = error instanceof CustomerAccessError
      ? error.code
      : "customer_read_model_unavailable";
    await auditCustomerRead(request, code, statusCode);
    return response.status(statusCode).json({
      error: code,
      message: statusCode === 503
        ? "Customer energy data is temporarily unavailable."
        : "The requested customer data is not available for this account.",
      correlation_id: request.correlationId
    });
  }

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

  app.get("/platform/status", async (request, response) => {
    try {
      const statusReader = options.platformStatusReader || buildPlatformStatus;
      const status = await statusReader({
        pool: options.auditPool || config.auditPool,
        config,
        kafka: options.kafka,
        healthFetch,
        ollamaFetch: options.ollamaFetch || fetch
      });

      await auditRecorder.record(buildAuditEvent({
        request,
        decision: "accepted",
        reason: "platform_status_read",
        statusCode: 200,
        targetService: "security-gateway",
        auditPayload: {
          status: status.pipeline_status || "unknown"
        }
      }));

      return response.json({
        status: "ok",
        platform: status
      });
    } catch (error) {
      console.error("Could not read platform status:", error);
      return response.status(503).json({
        error: "platform_status_unavailable",
        message: "Platform status could not be read safely.",
        correlation_id: request.correlationId
      });
    }
  });

  app.get("/platform/devices", async (request, response) => {
    try {
      const deviceReader = options.platformDevicesReader || listScalabilityDevices;
      const result = await deviceReader(options.auditPool || config.auditPool, {
        limit: request.query.limit,
        offset: request.query.offset
      });
      await auditRecorder.record(buildAuditEvent({
        request,
        decision: "accepted",
        reason: "platform_devices_read",
        statusCode: 200,
        targetService: "security-gateway",
        auditPayload: { limit: result.limit, offset: result.offset, count: result.devices.length }
      }));
      return response.json({ status: "ok", ...result });
    } catch (error) {
      return response.status(503).json({
        error: "platform_devices_unavailable",
        message: error.message,
        correlation_id: request.correlationId
      });
    }
  });

  app.get("/customer/households", async (request, response) => {
    try {
      if (!customerPool) {
        throw new CustomerAccessError("customer_read_model_unavailable", 503);
      }
      const context = readCustomerContext(request);
      const result = await customerReader.listHouseholds(customerPool, context, config);
      await auditCustomerRead(request, "customer_households_read", 200, {
        role: context.role,
        responseKind: "household_selector"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/summary", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await customerReader.getCustomerSummary(
        customerPool,
        context,
        householdId,
        config
      );
      await auditCustomerRead(request, "customer_summary_read", 200, {
        role: context.role,
        responseKind: "household_summary"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/analytics", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await customerReader.getCustomerAnalytics(
        customerPool,
        context,
        householdId,
        {
          range: request.query.range,
          start: request.query.start,
          end: request.query.end
        }
      );
      await auditCustomerRead(request, "customer_analytics_read", 200, {
        role: context.role,
        responseKind: "bounded_energy_series"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/devices", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const category = /^[a-z0-9_]{2,40}$/.test(String(request.query.category || ""))
        ? String(request.query.category)
        : undefined;
      const online = request.query.online === "true"
        ? true
        : request.query.online === "false"
          ? false
          : undefined;
      const flexible = request.query.flexible === "true"
        ? true
        : request.query.flexible === "false"
          ? false
          : undefined;
      const state = ["active", "idle", "offline"].includes(request.query.state)
        ? request.query.state
        : undefined;
      const result = await customerReader.getCustomerDevices(
        customerPool,
        context,
        householdId,
        {
          limit: request.query.limit,
          offset: request.query.offset,
          category,
          online,
          flexible,
          state
        }
      );
      await auditCustomerRead(request, "customer_devices_read", 200, {
        role: context.role,
        responseKind: "paginated_devices"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/devices/:deviceId", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const deviceId = String(request.params.deviceId || "");
      if (!/^[a-zA-Z0-9_-]{3,160}$/.test(deviceId)) {
        throw new CustomerAccessError("customer_device_not_found", 404);
      }
      const result = await customerReader.getCustomerDeviceDetail(
        customerPool,
        context,
        householdId,
        deviceId
      );
      if (!result) {
        throw new CustomerAccessError("customer_device_not_found", 404);
      }
      await auditCustomerRead(request, "customer_device_detail_read", 200, {
        role: context.role,
        responseKind: "bounded_device_detail"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/flexibility", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await customerReader.getCustomerFlexibility(
        customerPool,
        context,
        householdId
      );
      await auditCustomerRead(request, "customer_flexibility_read", 200, {
        role: context.role,
        responseKind: "flexibility_history"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/community", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await customerReader.getCustomerCommunity(
        customerPool,
        context,
        householdId,
        config
      );
      await auditCustomerRead(request, "customer_community_read", 200, {
        role: context.role,
        responseKind: "anonymized_community_summary"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/reports", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await customerReader.getCustomerReports(
        customerPool,
        context,
        householdId,
        { period: request.query.period }
      );
      await auditCustomerRead(request, "customer_report_read", 200, {
        role: context.role,
        responseKind: "customer_report"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/reports.csv", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const report = await customerReader.getCustomerReports(
        customerPool,
        context,
        householdId,
        { period: request.query.period }
      );
      const csv = customerReader.buildCustomerReportCsv(report);
      await auditCustomerRead(request, "customer_report_exported", 200, {
        role: context.role,
        responseKind: "customer_csv"
      });
      response.set("content-type", "text/csv; charset=utf-8");
      response.set(
        "content-disposition",
        `attachment; filename="adflex-${report.period}-energy-report.csv"`
      );
      return response.send(csv);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.get("/customer/insights", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await insightReader.getOrGenerateCustomerInsights({
        pool: customerPool,
        context,
        householdId,
        config,
        inferenceFetch: options.customerInsightFetch || fetch
      });
      await auditCustomerRead(request, "customer_insights_read", 200, {
        role: context.role,
        responseKind: "validated_insights"
      });
      return response.json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
    }
  });

  app.post("/customer/insights/refresh", async (request, response) => {
    try {
      const { context, householdId } = await customerScope(request);
      const result = await insightReader.getOrGenerateCustomerInsights({
        pool: customerPool,
        context,
        householdId,
        config,
        inferenceFetch: options.customerInsightFetch || fetch,
        force: true,
        trigger: "authorized_refresh"
      });
      await auditCustomerRead(request, "customer_insights_refreshed", 202, {
        role: context.role,
        responseKind: "validated_insights"
      });
      return response.status(202).json(result);
    } catch (error) {
      return sendCustomerError(request, response, error);
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
  await ensureCustomerDashboardReadModel(pool);
  await producer.connect();

  const auditRecorder = createAuditRecorder({
    pool,
    producer,
    insertAudit: safeInsertSecurityGatewayAudit,
    publishAudit: publishSecurityGatewayAudit,
    topic: config.auditTopic
  });
  const app = createApp({ config, auditRecorder, auditPool: pool, kafka });
  const insightScheduler = customerInsights.startCustomerInsightScheduler({
    pool,
    config
  });
  const server = app.listen(config.port, () => {
    console.log(`Security gateway listening on http://0.0.0.0:${config.port}`);
    console.log(`Publishing security audit events to ${config.auditTopic}`);
  });

  const shutdown = async () => {
    console.log("Shutting down security gateway...");
    server.close();
    clearInterval(insightScheduler);
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
