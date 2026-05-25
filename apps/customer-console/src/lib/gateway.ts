import { NextRequest, NextResponse } from "next/server";
import { hasApiSession } from "@/lib/auth";

type GatewayOptions = {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  request?: NextRequest;
};

function getGatewayBaseUrl() {
  return process.env.GATEWAY_BASE_URL || "http://localhost:3010";
}

function getEdgeApiKey() {
  return process.env.EDGE_API_KEY || "";
}

export function generateCorrelationId() {
  return `console-${crypto.randomUUID()}`;
}

export async function requireApiSession() {
  if (!(await hasApiSession())) {
    return NextResponse.json(
      {
        error: "dashboard_auth_required",
        message: "Please sign in to the operator console."
      },
      { status: 401 }
    );
  }
  return null;
}

export async function callGateway({ path, method = "GET", body, request }: GatewayOptions) {
  const apiKey = getEdgeApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      correlationId: null,
      body: {
        error: "edge_api_key_not_configured",
        message: "EDGE_API_KEY must be configured on the server."
      }
    };
  }

  const baseUrl = getGatewayBaseUrl().replace(/\/$/, "");
  const correlationId = request?.headers.get("x-correlation-id") || generateCorrelationId();
  const headers: Record<string, string> = {
    "x-edge-api-key": apiKey,
    "x-correlation-id": correlationId
  };

  if (method !== "GET") {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
    cache: "no-store"
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    correlationId: response.headers.get("x-correlation-id") || correlationId,
    body: parsed
  };
}

export async function gatewayJson(options: GatewayOptions) {
  const authError = await requireApiSession();
  if (authError) {
    return authError;
  }

  try {
    const result = await callGateway(options);
    return NextResponse.json(
      {
        ok: result.ok,
        status_code: result.status,
        correlation_id: result.correlationId,
        data: result.body
      },
      {
        status: result.status,
        headers: result.correlationId ? { "x-correlation-id": result.correlationId } : undefined
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown gateway error.";
    return NextResponse.json(
      {
        ok: false,
        error: "gateway_request_failed",
        message
      },
      { status: 502 }
    );
  }
}

export async function requestJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
