import { NextRequest } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  return gatewayJson({
    path: `/customer/community${customerQuery(request, {
      household_id: {}
    })}`,
    request
  });
}

