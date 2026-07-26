import { NextRequest, NextResponse } from "next/server";
import { authenticateDemoUser, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { checkLoginRateLimit, clearLoginAttempts } from "@/lib/login-rate-limit";

export async function POST(request: NextRequest) {
  const clientId =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local-client";
  const rateLimit = checkLoginRateLimit(clientId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "demo_login_rate_limited",
        message: "Sign-in is temporarily unavailable. Please wait and try again."
      },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) }
      }
    );
  }
  const body = await request.json().catch(() => ({}));
  const user = authenticateDemoUser(body.username, body.password);

  if (!user) {
    return NextResponse.json(
      {
        error: "invalid_demo_credentials",
        message: "The supplied credentials were not accepted."
      },
      { status: 401 }
    );
  }
  clearLoginAttempts(clientId);

  let token;
  try {
    token = createSessionToken({
      username: user.username,
      role: user.role,
      household_id: user.household_id,
      community_id: user.community_id
    });
  } catch {
    return NextResponse.json(
      {
        error: "demo_auth_not_configured",
        message: "Demo authentication is not configured."
      },
      { status: 503 }
    );
  }

  const response = NextResponse.json({
    status: "ok",
    username: user.username,
    role: user.role,
    deployment_mode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || "local"
  });

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secureCookie =
    forwardedProtocol === "https" ||
    request.nextUrl.protocol === "https:" ||
    process.env.DEMO_COOKIE_SECURE === "true";

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 60 * 60 * 8
  });

  return response;
}
