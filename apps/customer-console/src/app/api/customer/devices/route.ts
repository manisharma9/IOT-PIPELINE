import { NextRequest } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  return gatewayJson({
    path: `/customer/devices${customerQuery(request, {
      household_id: {},
      limit: { fallback: "12", pattern: /^(?:[1-9]|[1-4][0-9]|50)$/ },
      offset: { fallback: "0", pattern: /^\d{1,7}$/ }
    })}`,
    request
  });
}

