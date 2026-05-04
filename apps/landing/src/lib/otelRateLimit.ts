/**
 * Sliding-window rate limiter for the OTEL ingest endpoint.
 *
 * - Authed (valid Jira token): 120 req/min per (IP, tokenHash) bucket.
 * - Anonymous (no token / invalid): 30 req/min per IP bucket.
 * - Genesis: bypass entirely (caller skips the check).
 *
 * In-memory single-instance store. Adequate for the current Dockerized
 * single-replica landing deploy; swap for Redis if we ever scale horizontally.
 */
const RATE_WINDOW_MS = 60 * 1000;
const AUTHED_LIMIT_PER_WINDOW = 120;
const ANONYMOUS_LIMIT_PER_WINDOW = 30;
const PRUNE_INTERVAL_MS = 10 * 1000;

const buckets = new Map<string, number[]>();

let janitorStarted = false;
function ensureJanitor() {
  if (janitorStarted) return;
  janitorStarted = true;
  const interval = setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [key, timestamps] of buckets) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        buckets.delete(key);
      } else if (fresh.length !== timestamps.length) {
        buckets.set(key, fresh);
      }
    }
  }, PRUNE_INTERVAL_MS);
  if (typeof interval === "object" && interval !== null && "unref" in interval) {
    (interval as { unref: () => void }).unref();
  }
}

export type RateLimitTier = "authed" | "anonymous";

export interface AllowResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

export function allow(key: string, tier: RateLimitTier): AllowResult {
  ensureJanitor();
  const limit = tier === "authed" ? AUTHED_LIMIT_PER_WINDOW : ANONYMOUS_LIMIT_PER_WINDOW;
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    const oldest = timestamps[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + RATE_WINDOW_MS,
    };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return {
    allowed: true,
    remaining: limit - timestamps.length,
    resetAt: now + RATE_WINDOW_MS,
  };
}
