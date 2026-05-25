import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

export async function GET(request: NextRequest) {
  return gatewayJson({ path: "/dataspace/catalog", request });
}
