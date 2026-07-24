import { NextRequest } from "next/server";

const SAFE_QUERY_VALUE = /^[a-zA-Z0-9_:.+-]{1,160}$/;

export function customerQuery(
  request: NextRequest,
  allowed: Record<string, { fallback?: string; pattern?: RegExp }> = {}
) {
  const incoming = request.nextUrl.searchParams;
  const query = new URLSearchParams();

  for (const [name, rule] of Object.entries(allowed)) {
    const value = incoming.get(name) || rule.fallback;
    if (!value) {
      continue;
    }
    const pattern = rule.pattern || SAFE_QUERY_VALUE;
    if (pattern.test(value)) {
      query.set(name, value);
    }
  }

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

