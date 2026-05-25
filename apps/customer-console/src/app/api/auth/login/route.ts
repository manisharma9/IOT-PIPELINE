import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getDemoCredentials, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const credentials = getDemoCredentials();

  if (body.username !== credentials.username || body.password !== credentials.password) {
    return NextResponse.json(
      {
        error: "invalid_demo_credentials",
        message: "The demo operator credentials were not accepted."
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    status: "ok",
    username: credentials.username,
    deployment_mode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || "local"
  });

  response.cookies.set(SESSION_COOKIE, createSessionToken(credentials.username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  return response;
}
