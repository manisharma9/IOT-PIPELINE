import { NextRequest } from "next/server";
import { gatewayJson, requestJson } from "@/lib/gateway";

export async function POST(request: NextRequest) {
  return gatewayJson({
    path: "/telemetry",
    method: "POST",
    request,
    body: await requestJson(request)
  });
}
