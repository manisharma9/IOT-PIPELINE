import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "sgcc_session";

type SessionPayload = {
  username: string;
  issued_at: string;
};

function getSessionSecret() {
  return process.env.SESSION_SIGNING_SECRET || process.env.EDGE_API_KEY || process.env.DEMO_AUTH_PASSWORD || "local-demo-session-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(username: string) {
  const payload = toBase64Url(JSON.stringify({
    username,
    issued_at: new Date().toISOString()
  } satisfies SessionPayload));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const receivedBuffer = Buffer.from(signature || "");
  const expectedBuffer = Buffer.from(expected);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(payload)) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function hasApiSession() {
  return Boolean(await getSession());
}

export function getDemoCredentials() {
  return {
    username: process.env.DEMO_AUTH_USERNAME || "operator",
    password: process.env.DEMO_AUTH_PASSWORD || "operator123"
  };
}
