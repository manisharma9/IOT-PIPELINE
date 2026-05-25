import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") || "20";
  return gatewayJson({
    path: `/dispatch/proposals?limit=${encodeURIComponent(limit)}`,
    request
  });
}
