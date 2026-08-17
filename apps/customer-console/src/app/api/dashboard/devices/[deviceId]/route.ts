import { NextRequest, NextResponse } from "next/server";
import { customerQuery } from "@/lib/customer-route";
import { gatewayJson } from "@/lib/gateway";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(deviceId)) {
    return NextResponse.json({ error: "customer_device_not_found" }, { status: 404 });
  }
  return gatewayJson({
    path: `/customer/devices/${encodeURIComponent(deviceId)}${customerQuery(request, {
      household_id: {}
    })}`,
    request
  });
}

