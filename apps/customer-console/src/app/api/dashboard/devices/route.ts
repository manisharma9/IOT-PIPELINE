import { NextRequest } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  return gatewayJson({
    path: `/customer/devices${customerQuery(request, {
      household_id: {},
      category: { pattern: /^[a-z0-9_]{2,40}$/ },
      profile: { pattern: /^(apartment|standard_home|prosumer_home)$/ },
      search: { pattern: /^[a-zA-Z0-9 _-]{1,80}$/ },
      online: { pattern: /^(true|false)$/ },
      flexible: { pattern: /^(true|false)$/ },
      state: { pattern: /^(active|idle|offline)$/ },
      limit: { fallback: "12", pattern: /^(?:[1-9]|[1-4][0-9]|50)$/ },
      offset: { fallback: "0", pattern: /^\d{1,7}$/ }
    })}`,
    request
  });
}
