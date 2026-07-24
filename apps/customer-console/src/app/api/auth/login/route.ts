import { NextRequest, NextResponse } from "next/server";
import { authenticateDemoUser, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const user = authenticateDemoUser(body.username, body.password);

  if (!user) {
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
    username: user.username,
    role: user.role,
    deployment_mode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || "local"
  });

  response.cookies.set(SESSION_COOKIE, createSessionToken({
    username: user.username,
    role: user.role,
    household_id: user.household_id,
    community_id: user.community_id
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  return response;
}
