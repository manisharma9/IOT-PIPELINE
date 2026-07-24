import { NextRequest } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  return gatewayJson({
    path: `/customer/analytics${customerQuery(request, {
      household_id: {},
      range: { fallback: "24h", pattern: /^(24h|7d|30d|custom)$/ },
      start: { pattern: /^[0-9TZ:.-]{10,35}$/ },
      end: { pattern: /^[0-9TZ:.-]{10,35}$/ }
    })}`,
    request
  });
}

