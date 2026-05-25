import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

export async function POST(request: NextRequest) {
  return gatewayJson({
    path: "/telemetry",
    method: "POST",
    request,
    body: {
      community_id: "community-dublin-north",
      household_id: "blocked-test-household",
      device_id: "blocked-test-device",
      device_type: "simulated_meter",
      timestamp: new Date().toISOString(),
      readings: {
        active_power_kw: {
          value: "1 OR 1=1",
          unit: "kW"
        }
      }
    }
  });
}
