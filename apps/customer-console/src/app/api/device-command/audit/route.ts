import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") || "20";
  return gatewayJson({
    path: `/device-command/audit?limit=${encodeURIComponent(limit)}`,
    request
  });
}
