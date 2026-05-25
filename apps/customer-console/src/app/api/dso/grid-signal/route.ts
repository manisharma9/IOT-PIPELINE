import { NextRequest } from "next/server";
import { gatewayJson, requestJson } from "@/lib/gateway";

function toGridSignal(input: Record<string, unknown>) {
  const start = input.start_time ? new Date(String(input.start_time)) : new Date();
  const durationMinutes = Number(input.duration_minutes || 60);
  const end = new Date(start.getTime() + Math.max(durationMinutes, 15) * 60 * 1000);
  const reduction = input.requested_amount ? `${input.requested_amount} ${input.reduction_type || "fixed_kw"}` : "operator request";

  return {
    signal_id: input.signal_id || `console-signal-${Date.now()}`,
    dso_id: input.dso_id || "dso-console",
    community_id: input.community_id || "community-dublin-north",
    signal_type: "flexibility_request",
    severity: input.priority || "medium",
    requested_action: "reduce_load",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    reason: `${input.reason || "Operator load reduction request"} (${reduction})`
  };
}

export async function POST(request: NextRequest) {
  const body = (await requestJson(request)) as Record<string, unknown>;
  return gatewayJson({
    path: "/dso/grid-signal",
    method: "POST",
    request,
    body: toGridSignal(body)
  });
}
