import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const limit = search.get("limit") || "25";
  const offset = search.get("offset") || "0";
  return gatewayJson({
    path: `/platform/devices?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
    request
  });
}
