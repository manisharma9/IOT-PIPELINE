type Attempt = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, Attempt>();

function settings() {
  return {
    windowMs: Math.max(1000, Number(process.env.DEMO_LOGIN_WINDOW_MS || 60000)),
    maximum: Math.max(1, Number(process.env.DEMO_LOGIN_MAX_ATTEMPTS || 8))
  };
}

export function checkLoginRateLimit(clientId: string, now = Date.now()) {
  const { windowMs, maximum } = settings();
  const current = attempts.get(clientId);
  if (!current || current.resetAt <= now) {
    attempts.set(clientId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maximum - 1, retryAfterSeconds: 0 };
  }
  current.count += 1;
  attempts.set(clientId, current);
  return {
    allowed: current.count <= maximum,
    remaining: Math.max(0, maximum - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}

export function clearLoginAttempts(clientId: string) {
  attempts.delete(clientId);
}

export function resetLoginRateLimitsForTests() {
  attempts.clear();
}

