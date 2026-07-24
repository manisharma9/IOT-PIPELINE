import { NextRequest } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayJson } from "@/lib/gateway";

const allowedQuery = {
  household_id: {}
};

export async function GET(request: NextRequest) {
  return gatewayJson({
    path: `/customer/insights${customerQuery(request, allowedQuery)}`,
    request
  });
}

export async function POST(request: NextRequest) {
  return gatewayJson({
    path: `/customer/insights/refresh${customerQuery(request, allowedQuery)}`,
    method: "POST",
    body: {},
    request
  });
}

