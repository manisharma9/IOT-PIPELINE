import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "sgcc_session";

export type CustomerRole =
  | "household_user"
  | "enershare_operator"
  | "technical_admin";

export type SessionPayload = {
  username: string;
  role: CustomerRole;
  household_id: string | null;
  community_id: string;
  issued_at: string;
  expires_at: string;
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

export function createSessionToken(
  user: Pick<SessionPayload, "username" | "role" | "household_id" | "community_id">
) {
  const issuedAt = new Date();
  const payload = toBase64Url(JSON.stringify({
    ...user,
    issued_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.getTime() + 8 * 60 * 60 * 1000).toISOString()
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
    const session = JSON.parse(fromBase64Url(payload)) as SessionPayload;
    if (
      !["household_user", "enershare_operator", "technical_admin"].includes(session.role) ||
      !session.community_id ||
      !session.expires_at ||
      Date.parse(session.expires_at) <= Date.now() ||
      (session.role === "household_user" && !session.household_id)
    ) {
      return null;
    }
    return session;
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

export async function requireRole(roles: CustomerRole[]) {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    redirect("/dashboard");
  }
  return session;
}

export async function hasApiSession() {
  return Boolean(await getSession());
}

type DemoUser = Pick<
  SessionPayload,
  "username" | "role" | "household_id" | "community_id"
> & { password: string };

export function getDemoUsers(): DemoUser[] {
  const community = process.env.DEMO_AUTH_COMMUNITY_ID || "community-dublin-north";
  return [
    {
      username: process.env.DEMO_HOUSEHOLD_USERNAME || "household",
      password: process.env.DEMO_HOUSEHOLD_PASSWORD || "household123",
      role: "household_user",
      household_id: process.env.DEMO_HOUSEHOLD_ID || process.env.DEMO_AUTH_HOUSEHOLD_ID || "household-001",
      community_id: community
    },
    {
      username: process.env.DEMO_AUTH_USERNAME || "operator",
      password: process.env.DEMO_AUTH_PASSWORD || "operator123",
      role: process.env.DEMO_AUTH_ROLE === "technical_admin"
        ? "technical_admin"
        : "enershare_operator",
      household_id: null,
      community_id: community
    },
    {
      username: process.env.DEMO_ADMIN_USERNAME || "admin",
      password: process.env.DEMO_ADMIN_PASSWORD || "admin123",
      role: "technical_admin",
      household_id: null,
      community_id: community
    }
  ];
}

export function authenticateDemoUser(username: unknown, password: unknown) {
  return getDemoUsers().find((user) => (
    user.username === username && user.password === password
  )) || null;
}
