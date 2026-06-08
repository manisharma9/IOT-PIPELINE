"use strict";

const crypto = require("node:crypto");

const DPI_PATTERNS = Object.freeze([
  {
    reason: "sql_injection_like_payload",
    pattern: /(\bunion\b[\s\S]{0,80}\bselect\b|\bselect\b[\s\S]{0,80}\bfrom\b|\bdrop\s+table\b|;\s*--|--\s|\bor\s+1\s*=\s*1\b|'\s*or\s*'1'\s*=\s*'1)/i
  },
  {
    reason: "xss_like_payload",
    pattern: /(<script\b|<\/script>|javascript:|onerror\s*=|onload\s*=)/i
  },
  {
    reason: "path_traversal_like_payload",
    pattern: /(\.\.\/|\.\.\\|%2e%2e|%252e%252e)/i
  },
  {
    reason: "command_injection_like_payload",
    pattern: /(\|\||&&|`|\$\(|;\s*(cat|rm|curl|wget|powershell|cmd|bash|sh)\b)/i
  }
]);

function generateCorrelationId() {
  return crypto.randomUUID();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function getApiKeyId(apiKey) {
  return apiKey ? `edge-key-${hashValue(apiKey).slice(0, 12)}` : null;
}

function normalizeIp(ip) {
  const value = String(ip || "").trim();
  if (value.startsWith("::ffff:")) {
    return value.slice(7);
  }
  return value === "::1" ? "127.0.0.1" : value;
}

function getClientIp(request) {
  const forwarded = request.get("x-forwarded-for");
  const firstForwarded = forwarded ? forwarded.split(",")[0].trim() : "";
  return normalizeIp(firstForwarded || request.ip || request.socket.remoteAddress);
}

function isHealthRoute(request) {
  return request.method === "GET" && ["/health", "/edge/health"].includes(request.path);
}

function isJsonContentType(request) {
  if (!["POST", "PUT", "PATCH"].includes(request.method)) {
    return true;
  }
  return Boolean(request.is("application/json"));
}

function validateApiKey(request, config) {
  const apiKey = request.get("x-edge-api-key");
  if (!apiKey) {
    return { valid: false, reason: "missing_edge_api_key", apiKeyId: null };
  }

  if (apiKey !== config.edgeApiKey) {
    return {
      valid: false,
      reason: "invalid_edge_api_key",
      apiKeyId: getApiKeyId(apiKey)
    };
  }

  return {
    valid: true,
    apiKeyId: getApiKeyId(apiKey)
  };
}

function validateJwtReady(request, config) {
  if (!config.jwtAuthEnabled) {
    return {
      valid: true,
      authMode: "api_key"
    };
  }

  const authorization = request.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return {
      valid: false,
      reason: "jwt_required",
      authMode: "api_key_and_jwt"
    };
  }

  return {
    valid: false,
    reason: "jwt_validation_not_configured",
    authMode: "api_key_and_jwt"
  };
}

function checkIpAccess(clientIp, config) {
  const normalized = normalizeIp(clientIp);
  if (config.ipBlocklist.includes(normalized)) {
    return {
      allowed: false,
      reason: "ip_blocked"
    };
  }

  if (config.ipAllowlist.length > 0 && !config.ipAllowlist.includes(normalized)) {
    return {
      allowed: false,
      reason: "ip_not_allowed"
    };
  }

  return { allowed: true };
}

function checkRateLimit(clientIp, config, store, now = Date.now()) {
  const key = normalizeIp(clientIp) || "unknown";
  const existing = store.get(key);
  if (!existing || now - existing.windowStart >= config.rateLimitWindowMs) {
    store.set(key, {
      windowStart: now,
      count: 1
    });
    return { allowed: true, remaining: Math.max(config.rateLimitMaxRequests - 1, 0) };
  }

  existing.count += 1;
  if (existing.count > config.rateLimitMaxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: config.rateLimitWindowMs - (now - existing.windowStart)
    };
  }

  return {
    allowed: true,
    remaining: Math.max(config.rateLimitMaxRequests - existing.count, 0)
  };
}

function inspectPayload(rawBody, url = "") {
  const inspected = `${url}\n${rawBody || ""}`;
  for (const rule of DPI_PATTERNS) {
    if (rule.pattern.test(inspected)) {
      return {
        allowed: false,
        reason: rule.reason
      };
    }
  }

  return { allowed: true };
}

function buildCorsHeaders(config, origin) {
  const allowed = config.corsAllowedOrigins;
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-edge-api-key,x-correlation-id,authorization",
    "access-control-expose-headers": "x-correlation-id"
  };
}

module.exports = {
  DPI_PATTERNS,
  buildCorsHeaders,
  checkIpAccess,
  checkRateLimit,
  generateCorrelationId,
  getApiKeyId,
  getClientIp,
  hashValue,
  inspectPayload,
  isHealthRoute,
  isJsonContentType,
  normalizeIp,
  validateApiKey,
  validateJwtReady
};
