"use strict";

function parseInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  return {
    port: parseInteger(env.SECURITY_GATEWAY_PORT || env.PORT, 3010),
    edgeApiKey: env.EDGE_API_KEY || "local-dev-edge-key",
    jwtAuthEnabled: String(env.JWT_AUTH_ENABLED || "false").toLowerCase() === "true",
    jwtIssuer: env.JWT_ISSUER || "",
    jwtAudience: env.JWT_AUDIENCE || "",
    rateLimitWindowMs: parseInteger(env.EDGE_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMaxRequests: parseInteger(env.EDGE_RATE_LIMIT_MAX_REQUESTS, 120),
    ipAllowlist: parseList(env.EDGE_IP_ALLOWLIST),
    ipBlocklist: parseList(env.EDGE_IP_BLOCKLIST),
    requestBodyLimit: env.EDGE_REQUEST_BODY_LIMIT || "256kb",
    corsAllowedOrigins: parseList(
      env.CORS_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000"
    ),
    auditTopic: env.SECURITY_GATEWAY_AUDIT_TOPIC || "security.gateway.audit",
    kafkaBrokers: env.KAFKA_BROKERS || env.KAFKA_BROKER || "kafka:29092",
    dataspacesInternalApiKey: env.DATASPACE_API_KEY || "local-dev-dataspace-key",
    ollamaBaseUrl: env.OLLAMA_BASE_URL || "http://host.docker.internal:11434",
    slmModel: env.SLM_MODEL || env.OLLAMA_MODEL || "phi3:mini",
    slmPrimary: String(env.SLM_PRIMARY || "true").toLowerCase() === "true",
    customerPseudonymizationSalt:
      env.CUSTOMER_DASHBOARD_PSEUDONYMIZATION_SALT ||
      env.DATASPACE_PSEUDONYMIZATION_SALT ||
      "local-dashboard-salt",
    customerInsightRefreshMinutes: parseInteger(
      env.CUSTOMER_INSIGHT_REFRESH_MINUTES,
      60
    ),
    customerInsightTimeoutMs: parseInteger(
      env.CUSTOMER_INSIGHT_TIMEOUT_MS,
      20000
    ),
    targets: {
      ingestion: env.INGESTION_API_URL || "http://ingestion-api:3001",
      ieee20305: env.IEEE20305_TRANSLATOR_URL || "http://ieee20305-translator:3002",
      aggregator: env.AGGREGATOR_URL || "http://aggregator:3003",
      approval: env.APPROVAL_WORKFLOW_URL || "http://approval-workflow:3004",
      mockDispatch: env.MOCK_DISPATCH_ADAPTER_URL || "http://mock-dispatch-adapter:3005",
      dataspace: env.DATASPACE_EXPORT_URL || "http://dataspace-export:3006",
      deviceCommand: env.DEVICE_COMMAND_TRANSLATOR_URL || "http://device-command-translator:3009"
    }
  };
}

module.exports = {
  loadConfig,
  parseList
};
