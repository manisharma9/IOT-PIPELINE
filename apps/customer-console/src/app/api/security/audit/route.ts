import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["limit", "correlation_id", "decision"]) {
    const value = url.searchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }

  return gatewayJson({
    path: `/security/audit${params.toString() ? `?${params.toString()}` : ""}`,
    request
  });
}
