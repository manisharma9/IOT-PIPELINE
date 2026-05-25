"use strict";

const { hashValue } = require("./security");

function getUserAgent(request) {
  return request.get("user-agent") || "";
}

function buildAuditEvent({
  request,
  decision,
  reason,
  statusCode,
  targetService = null,
  apiKeyId = null,
  authMode = "api_key",
  auditPayload = {}
}) {
  const eventTime = new Date().toISOString();
  const rawBody = request.rawBody || "";
  const requestHashSource = rawBody || `${request.method} ${request.originalUrl}`;

  return {
    event_time: eventTime,
    created_at: eventTime,
    correlation_id: request.correlationId,
    client_ip: request.clientIp || null,
    method: request.method,
    route: request.originalUrl || request.path,
    decision,
    reason,
    status_code: statusCode,
    target_service: targetService,
    request_hash: hashValue(requestHashSource),
    user_agent: getUserAgent(request),
    api_key_id: apiKeyId || request.edgeApiKeyId || null,
    auth_mode: authMode || request.authMode || "api_key",
    audit_payload: {
      ...auditPayload,
      no_raw_body_stored: true
    }
  };
}

function createAuditRecorder({ pool, producer, insertAudit, publishAudit, topic }) {
  return {
    async record(event) {
      try {
        if (insertAudit) {
          await insertAudit(pool, event);
        }
      } catch (error) {
        console.error("Security gateway audit database write failed:", error);
      }

      try {
        if (publishAudit) {
          await publishAudit(producer, topic, event);
        }
      } catch (error) {
        console.error("Security gateway audit Kafka publish failed:", error);
      }
    }
  };
}

module.exports = {
  buildAuditEvent,
  createAuditRecorder
};
