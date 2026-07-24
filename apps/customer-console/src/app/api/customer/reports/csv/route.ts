import { NextRequest } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayDownload } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  return gatewayDownload({
    path: `/customer/reports.csv${customerQuery(request, {
      household_id: {},
      period: { fallback: "weekly", pattern: /^(daily|weekly|monthly)$/ }
    })}`,
    request
  });
}

