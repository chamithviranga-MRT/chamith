// Minimal in-memory sliding-window limiter, keyed by anonymous session id.
// Protects the endpoints that spend Anthropic / Firecrawl credits. Single-process only;
// use Redis (or similar) if you run more than one instance.

const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, retryAfterS: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, retryAfterS: 0 };
}

export function resetRateLimits() {
  hits.clear();
}
