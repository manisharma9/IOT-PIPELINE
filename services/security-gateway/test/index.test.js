"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildAuditEvent } = require("../src/audit");
const { loadConfig } = require("../src/config");
const { createApp } = require("../src/index");

function testConfig(overrides = {}) {
  return {
    ...loadConfig({
      EDGE_API_KEY: "test-edge-key",
      EDGE_RATE_LIMIT_WINDOW_MS: "60000",
      EDGE_RATE_LIMIT_MAX_REQUESTS: "120",
      EDGE_REQUEST_BODY_LIMIT: "16kb",
      CORS_ALLOWED_ORIGINS: "http://localhost:5173",
      DATASPACE_API_KEY: "local-dev-dataspace-key"
    }),
    targets: {
      ingestion: "http://ingestion-api:3001",
      ieee20305: "http://ieee20305-translator:3002",
      aggregator: "http://aggregator:3003",
      approval: "http://approval-workflow:3004",
      mockDispatch: "http://mock-dispatch-adapter:3005",
      dataspace: "http://dataspace-export:3006",
      deviceCommand: "http://device-command-translator:3009"
    },
    ...overrides
  };
}

function createTestGateway(options = {}) {
  const audits = [];
  const calls = [];
  const config = testConfig(options.config || {});
  const proxyFetch = options.proxyFetch || (async (url, fetchOptions = {}) => {
    calls.push({ url, fetchOptions });
    return new Response(JSON.stringify({ ok: true, url }), {
      status: options.downstreamStatus || 200,
      headers: {
        "content-type": "application/json"
      }
    });
  });
  const app = createApp({
    config,
    proxyFetch,
    healthFetch: async () => new Response("{}", { status: 200 }),
    auditRecorder: {
      record: async (event) => audits.push(event)
    },
    auditPool: options.auditPool,
    platformStatusReader: options.platformStatusReader,
    platformDevicesReader: options.platformDevicesReader,
    customerReadModel: options.customerReadModel,
    customerInsights: options.customerInsights,
    rateLimitStore: new Map()
  });

  return { app, audits, calls, config };
}

function request(app, method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const headers = options.headers || {};
      const body = typeof options.body === "undefined"
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);

      fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers,
        body
      })
        .then(async (response) => {
          const text = await response.text();
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({
            status: response.status,
            headers: response.headers,
            body: json,
            text
          });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

function edgeHeaders(extra = {}) {
  return {
    "x-edge-api-key": "test-edge-key",
    "content-type": "application/json",
    ...extra
  };
}

function customerHeaders(extra = {}) {
  return edgeHeaders({
    "x-customer-role": "household_user",
    "x-customer-username": "household-a-user",
    "x-customer-household-id": "household-a",
    "x-customer-community-id": "community-one",
    ...extra
  });
}

test("gateway health works without API key", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "GET", "/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.service, "security-gateway");
});

test("valid API key allows request", async () => {
  const { app, calls } = createTestGateway();
  const response = await request(app, "GET", "/dispatch/proposals?limit=1", {
    headers: { "x-edge-api-key": "test-edge-key" }
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://aggregator:3003/dispatch/proposals?limit=1");
});

test("missing API key returns 401", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "GET", "/dispatch/proposals");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "unauthorized_edge_request");
});

test("invalid API key returns 401", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "GET", "/dispatch/proposals", {
    headers: { "x-edge-api-key": "wrong" }
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.reason, "invalid_edge_api_key");
});

test("blocked IP returns 403", async () => {
  const { app } = createTestGateway({
    config: {
      ipBlocklist: ["203.0.113.10"]
    }
  });
  const response = await request(app, "GET", "/dispatch/proposals", {
    headers: {
      "x-edge-api-key": "test-edge-key",
      "x-forwarded-for": "203.0.113.10"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.reason, "ip_blocked");
});

test("invalid content type returns 415", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "POST", "/telemetry", {
    headers: {
      "x-edge-api-key": "test-edge-key",
      "content-type": "text/plain"
    },
    body: "plain text"
  });

  assert.equal(response.status, 415);
});

test("rate limit returns 429", async () => {
  const { app } = createTestGateway({
    config: {
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60000
    }
  });
  const headers = {
    "x-edge-api-key": "test-edge-key",
    "x-forwarded-for": "198.51.100.20"
  };

  const first = await request(app, "GET", "/dispatch/proposals", { headers });
  const second = await request(app, "GET", "/dispatch/proposals", { headers });

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.body.error, "rate_limit_exceeded");
});

test("SQL injection-like payload is blocked", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "POST", "/telemetry", {
    headers: edgeHeaders(),
    body: {
      readings: {
        active_power_kw: "1 OR 1=1"
      }
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.reason, "sql_injection_like_payload");
});

test("standalone SQL select-from payload is blocked", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "POST", "/telemetry", {
    headers: edgeHeaders(),
    body: {
      source: "SELECT * FROM users"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.reason, "sql_injection_like_payload");
});

test("XSS-like payload is blocked", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "POST", "/telemetry", {
    headers: edgeHeaders(),
    body: {
      note: "<script>alert(1)</script>"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.reason, "xss_like_payload");
});

test("path traversal-like payload is blocked", async () => {
  const { app } = createTestGateway();
  const response = await request(app, "GET", "/dispatch/proposals?path=../secret", {
    headers: { "x-edge-api-key": "test-edge-key" }
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.reason, "path_traversal_like_payload");
});

test("unknown route returns 404 and is audited", async () => {
  const { app, audits } = createTestGateway();
  const response = await request(app, "GET", "/unknown", {
    headers: { "x-edge-api-key": "test-edge-key" }
  });

  assert.equal(response.status, 404);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].decision, "blocked");
  assert.equal(audits[0].reason, "unknown_route");
});

test("valid /telemetry request is forwarded", async () => {
  const { app, calls } = createTestGateway({ downstreamStatus: 202 });
  const response = await request(app, "POST", "/telemetry", {
    headers: edgeHeaders(),
    body: {
      household_id: "household-1",
      readings: {}
    }
  });

  assert.equal(response.status, 202);
  assert.equal(calls[0].url, "http://ingestion-api:3001/telemetry");
});

test("valid /api/ingest compatibility request is forwarded", async () => {
  const { app, calls } = createTestGateway({ downstreamStatus: 202 });
  const response = await request(app, "POST", "/api/ingest", {
    headers: edgeHeaders(),
    body: {
      deviceId: "heat-pump-001",
      deviceType: "heat_pump",
      timestamp: "2026-05-25T12:00:00Z",
      data: {
        heat_pump_power_kw: {
          value: 2.1,
          unit: "kW"
        }
      }
    }
  });

  assert.equal(response.status, 202);
  assert.equal(calls[0].url, "http://ingestion-api:3001/api/ingest");
});

test("valid /dso/grid-signal request is forwarded", async () => {
  const { app, calls } = createTestGateway({ downstreamStatus: 202 });
  const response = await request(app, "POST", "/dso/grid-signal", {
    headers: edgeHeaders(),
    body: {
      signal_id: "signal-1",
      requested_action: "reduce_load"
    }
  });

  assert.equal(response.status, 202);
  assert.equal(calls[0].url, "http://ieee20305-translator:3002/dso/grid-signal");
});

test("accepted audit event is built", () => {
  const requestShape = {
    rawBody: "{\"ok\":true}",
    method: "POST",
    originalUrl: "/telemetry",
    path: "/telemetry",
    correlationId: "corr-1",
    clientIp: "127.0.0.1",
    edgeApiKeyId: "edge-key-test",
    authMode: "api_key",
    get: (name) => (name === "user-agent" ? "node-test" : "")
  };
  const audit = buildAuditEvent({
    request: requestShape,
    decision: "accepted",
    reason: "request_forwarded",
    statusCode: 202,
    targetService: "telemetry"
  });

  assert.equal(audit.decision, "accepted");
  assert.equal(audit.audit_payload.no_raw_body_stored, true);
  assert.ok(audit.request_hash);
});

test("blocked audit event is built", () => {
  const requestShape = {
    rawBody: "<script>",
    method: "POST",
    originalUrl: "/telemetry",
    path: "/telemetry",
    correlationId: "corr-2",
    clientIp: "127.0.0.1",
    get: () => ""
  };
  const audit = buildAuditEvent({
    request: requestShape,
    decision: "blocked",
    reason: "xss_like_payload",
    statusCode: 403
  });

  assert.equal(audit.decision, "blocked");
  assert.equal(audit.reason, "xss_like_payload");
  assert.equal(audit.audit_payload.no_raw_body_stored, true);
});

test("correlation ID is returned and forwarded", async () => {
  const { app, calls } = createTestGateway();
  const response = await request(app, "GET", "/dispatch/proposals", {
    headers: {
      "x-edge-api-key": "test-edge-key",
      "x-correlation-id": "corr-forwarded"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-correlation-id"), "corr-forwarded");
  assert.equal(calls[0].fetchOptions.headers["x-correlation-id"], "corr-forwarded");
});

test("security audit endpoint returns sanitized rows", async () => {
  const { app } = createTestGateway({
    auditPool: {
      query: async (_sql, params) => {
        assert.deepEqual(params, ["corr-1", "blocked", 5]);
        return {
          rows: [
            {
              id: "1",
              event_time: "2026-05-25T00:00:00.000Z",
              created_at: "2026-05-25T00:00:00.000Z",
              correlation_id: "corr-1",
              method: "POST",
              route: "/telemetry",
              decision: "blocked",
              reason: "sql_injection_like_payload",
              status_code: 403,
              target_service: null,
              request_hash: "hash-only",
              auth_mode: "api_key",
              audit_payload: {
                no_raw_body_stored: true,
                secret: "must-not-leak"
              }
            }
          ]
        };
      }
    }
  });

  const response = await request(
    app,
    "GET",
    "/security/audit?limit=5&correlation_id=corr-1&decision=blocked",
    {
      headers: { "x-edge-api-key": "test-edge-key" }
    }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.audit[0].request_hash, "hash-only");
  assert.equal(response.body.audit[0].audit_payload.no_raw_body_stored, true);
  assert.equal(response.body.audit[0].audit_payload.secret, undefined);
});

test("platform status endpoint returns safe local pipeline summary", async () => {
  const { app, audits } = createTestGateway({
    platformStatusReader: async () => ({
      generated_at: "2026-06-15T00:00:00.000Z",
      pipeline_status: "operational",
      services: {
        gateway: {
          service: "security-gateway",
          status: "ok"
        },
        downstream: []
      },
      kafka: {
        status: "ok",
        topics: ["raw.telemetry", "semantic.enriched"]
      },
      storage: {
        status: "ok",
        table_counts: {
          raw_telemetry: 12,
          semantic_events: 10
        }
      },
      semantic: {
        ollama: {
          status: "ok",
          model: "phi3:mini",
          phi3_mini_available: true,
          slm_primary_enabled: true
        },
        counts: {
          slm_call_count: 10,
          successful_slm_mappings: 8,
          deterministic_fallback_count: 2
        }
      },
      safety: {
        no_real_device_control: true
      }
    })
  });

  const response = await request(app, "GET", "/platform/status", {
    headers: { "x-edge-api-key": "test-edge-key" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.platform.pipeline_status, "operational");
  assert.equal(response.body.platform.semantic.ollama.model, "phi3:mini");
  assert.equal(response.body.platform.safety.no_real_device_control, true);
  assert.equal(audits.at(-1).reason, "platform_status_read");
});

test("platform devices endpoint returns a bounded paginated summary", async () => {
  const { app, audits } = createTestGateway({
    platformDevicesReader: async (_pool, options) => ({
      limit: Number(options.limit),
      offset: Number(options.offset),
      total: 10000,
      devices: [{ device_id: "scale-device-000026", final_status: "mapped" }]
    })
  });

  const response = await request(app, "GET", "/platform/devices?limit=25&offset=25", {
    headers: { "x-edge-api-key": "test-edge-key" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.limit, 25);
  assert.equal(response.body.offset, 25);
  assert.equal(response.body.total, 10000);
  assert.equal(response.body.devices.length, 1);
  assert.equal(audits.at(-1).reason, "platform_devices_read");
});

test("household customer cannot request another household", async () => {
  const { app, audits } = createTestGateway({
    auditPool: {
      query: async () => ({ rows: [] })
    }
  });

  const response = await request(
    app,
    "GET",
    "/customer/summary?household_id=household-b",
    { headers: customerHeaders() }
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "household_access_denied");
  assert.equal(audits.at(-1).reason, "household_access_denied");
});

test("authorized customer summary returns minimized product data", async () => {
  const customerReadModel = {
    getCustomerSummary: async (_pool, context, householdId) => ({
      household: {
        display_name: "Your household",
        community_id: context.communityId
      },
      connection: { status: "live", last_updated: "2026-07-24T10:00:00.000Z" },
      live_consumption_kw: 2.4,
      energy_used_today_kwh: 8.2,
      active_devices: 3,
      total_devices: 3,
      flexible_load_available_kw: 1.7,
      current_grid_event: null,
      simulation: {
        enabled: true,
        no_real_execution: true
      },
      unavailable_metrics: ["financial_savings"],
      resolved_household_for_test: householdId
    })
  };
  const { app, audits } = createTestGateway({
    auditPool: { query: async () => ({ rows: [] }) },
    customerReadModel
  });

  const response = await request(app, "GET", "/customer/summary", {
    headers: customerHeaders()
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.live_consumption_kw, 2.4);
  assert.equal(response.body.simulation.no_real_execution, true);
  assert.equal(response.body.resolved_household_for_test, "household-a");
  assert.equal(JSON.stringify(response.body).includes("raw_telemetry"), false);
  assert.equal(JSON.stringify(response.body).includes("kafka"), false);
  assert.equal(audits.at(-1).reason, "customer_summary_read");
});

test("customer devices endpoint forwards bounded inventory filters", async () => {
  let received;
  const customerReadModel = {
    getCustomerDevices: async (_pool, _context, householdId, options) => {
      received = { householdId, options };
      return {
        limit: Number(options.limit),
        offset: Number(options.offset),
        total: 1,
        devices: [{
          device_id: "household-a-dishwasher-01",
          device_category: "dishwasher",
          simulated: true,
          no_real_execution: true
        }],
        summary: { total_devices: 1 },
        simulation: true,
        no_real_execution: true
      };
    }
  };
  const { app, audits } = createTestGateway({
    auditPool: { query: async () => ({ rows: [] }) },
    customerReadModel
  });

  const response = await request(
    app,
    "GET",
    "/customer/devices?limit=12&offset=24&category=dishwasher&profile=standard_home&search=kitchen&online=true&flexible=true&state=active",
    { headers: customerHeaders() }
  );

  assert.equal(response.status, 200);
  assert.equal(received.householdId, "household-a");
  assert.deepEqual(received.options, {
    limit: "12",
    offset: "24",
    category: "dishwasher",
    profile: "standard_home",
    search: "kitchen",
    online: true,
    flexible: true,
    state: "active"
  });
  assert.equal(response.body.devices[0].no_real_execution, true);
  assert.equal(audits.at(-1).reason, "customer_devices_read");
});

test("customer device detail remains scoped to the authorized household", async () => {
  let received;
  const customerReadModel = {
    getCustomerDeviceDetail: async (_pool, _context, householdId, deviceId) => {
      received = { householdId, deviceId };
      return {
        device: {
          device_id: deviceId,
          simulated: true,
          no_real_execution: true
        },
        recent_usage: [],
        no_real_execution: true
      };
    }
  };
  const { app, audits } = createTestGateway({
    auditPool: { query: async () => ({ rows: [] }) },
    customerReadModel
  });

  const response = await request(
    app,
    "GET",
    "/customer/devices/household-a-heat-pump-01",
    { headers: customerHeaders() }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    householdId: "household-a",
    deviceId: "household-a-heat-pump-01"
  });
  assert.equal(response.body.no_real_execution, true);
  assert.equal(audits.at(-1).reason, "customer_device_detail_read");
});

test("customer insight endpoint returns validated product copy only", async () => {
  const customerInsights = {
    getOrGenerateCustomerInsights: async () => ({
      status: "cached",
      insights: [{
        insight_id: "insight-1",
        category: "peak_period",
        title: "Peak energy period",
        text: "Household power peaked at 2.4 kW during the selected period.",
        confidence: 0.91,
        validation_status: "validated",
        label: "AI-powered energy insight"
      }]
    })
  };
  const { app } = createTestGateway({
    auditPool: { query: async () => ({ rows: [] }) },
    customerInsights
  });

  const response = await request(app, "GET", "/customer/insights", {
    headers: customerHeaders()
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.insights[0].label, "AI-powered energy insight");
  assert.equal("model_identifier" in response.body.insights[0], false);
  assert.equal("prompt" in response.body.insights[0], false);
});
