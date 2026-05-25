import { NextRequest, NextResponse } from "next/server";
import { gatewayJson, requestJson } from "@/lib/gateway";

export async function POST(request: NextRequest) {
  const body = (await requestJson(request)) as Record<string, unknown>;
  if (!body.id) {
    return NextResponse.json({ error: "proposal_id_required" }, { status: 400 });
  }
  return gatewayJson({
    path: `/approvals/proposals/${encodeURIComponent(String(body.id))}/approve`,
    method: "POST",
    request,
    body
  });
}
