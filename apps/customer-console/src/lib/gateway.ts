import { NextRequest, NextResponse } from "next/server";
import { getSession, type CustomerRole } from "@/lib/auth";

export type GatewayOptions = {
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
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        error: "dashboard_auth_required",
        message: "Please sign in to EnerShare."
      },
      { status: 401 }
    );
  }
  return session;
}

export async function requireApiRole(roles: CustomerRole[]) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) {
    return session;
  }
  if (!roles.includes(session.role)) {
    return NextResponse.json(
      {
        error: "customer_action_forbidden",
        message: "This account can view the event but cannot change its status."
      },
      { status: 403 }
    );
  }
  return session;
}

export async function callGateway({
  path,
  method = "GET",
  body,
  request
}: GatewayOptions) {
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

  const session = await getSession();
  const baseUrl = getGatewayBaseUrl().replace(/\/$/, "");
  const correlationId = request?.headers.get("x-correlation-id") || generateCorrelationId();
  const headers: Record<string, string> = {
    "x-edge-api-key": apiKey,
    "x-correlation-id": correlationId
  };

  if (session) {
    headers["x-customer-role"] = session.role;
    headers["x-customer-username"] = session.username;
    headers["x-customer-community-id"] = session.community_id;
    if (session.household_id) {
      headers["x-customer-household-id"] = session.household_id;
    }
  }

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
  const contentType = response.headers.get("content-type") || "";
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = contentType.includes("text/csv") ? text : null;
  }

  return {
    ok: response.ok,
    status: response.status,
    correlationId: response.headers.get("x-correlation-id") || correlationId,
    body: parsed,
    contentType,
    contentDisposition: response.headers.get("content-disposition")
  };
}

export async function gatewayJson(options: GatewayOptions) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) {
    return session;
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
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "gateway_request_failed",
        message: "Customer energy data is temporarily unavailable."
      },
      { status: 502 }
    );
  }
}

export async function gatewayDownload(options: GatewayOptions) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const result = await callGateway(options);
    if (!result.ok || typeof result.body !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "report_export_failed",
          message: "The report could not be exported.",
          correlation_id: result.correlationId
        },
        { status: result.status }
      );
    }
    return new NextResponse(result.body, {
      status: result.status,
      headers: {
        "content-type": result.contentType || "text/csv; charset=utf-8",
        "content-disposition":
          result.contentDisposition || 'attachment; filename="enershare-energy-report.csv"',
        ...(result.correlationId
          ? { "x-correlation-id": result.correlationId }
          : {})
      }
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "report_export_failed",
        message: "The report could not be exported."
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
