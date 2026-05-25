import { NextRequest } from "next/server";
import { gatewayJson } from "@/lib/gateway";

const EXPORT_PATHS: Record<string, string> = {
  semantic: "/dataspace/export/semantic-summary",
  grid: "/dataspace/export/grid-signal-summary",
  dispatch: "/dataspace/export/dispatch-proposal-summary",
  approval: "/dataspace/export/approval-audit-summary",
  mock: "/dataspace/export/mock-dispatch-summary",
  full: "/dataspace/export/full-pipeline-demo-summary"
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset") || "full";
  const limit = url.searchParams.get("limit") || "20";
  const path = EXPORT_PATHS[asset] || EXPORT_PATHS.full;
  return gatewayJson({
    path: `${path}?limit=${encodeURIComponent(limit)}`,
    request
  });
}
