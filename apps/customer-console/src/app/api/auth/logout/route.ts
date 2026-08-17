import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ status: "ok" });
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure:
      forwardedProtocol === "https" ||
      request.nextUrl.protocol === "https:" ||
      process.env.DEMO_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 0
  });
  return response;
}
