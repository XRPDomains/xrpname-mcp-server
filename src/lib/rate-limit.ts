/**
 * Rate limiting — §12.1. Fixed-window counter backed by the Cache layer
 * (Redis atomic INCR in prod, in-memory otherwise), so it needs no extra
 * dependency and works in both transports.
 *
 * Limits (per minute):
 *   - authenticated address, READ tools: 60
 *   - unauthenticated, per IP:           30   (only check_domains is unauth)
 *
 * The window is fixed: all calls in the same wall-clock window share one
 * counter keyed by the window's start second, so the bucket TTL never slides.
 */
import type { Cache } from '../clients/cache.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests left in the current window (0 once exceeded). */
  remaining: number;
  /** Seconds until the current window resets. */
  resetSec: number;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  /** Per-authenticated-address READ budget per window. */
  readPerWindow: number;
  /** Per-IP budget per window for unauthenticated callers. */
  unauthPerWindow: number;
  windowSec: number;
}

/**
 * Increment and evaluate the fixed-window counter for `key`.
 * Exported (and pure but for the injected cache) so it is unit-testable with an
 * in-memory cache.
 */
export async function checkRateLimit(
  cache: Pick<Cache, 'incr'>,
  key: string,
  limit: number,
  windowSec: number,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const nowSec = Math.floor(nowMs / 1000);
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const bucketKey = `rl:${key}:${windowStart}`;

  const count = await cache.incr(bucketKey, windowSec);
  const resetSec = windowStart + windowSec - nowSec;
  const allowed = count <= limit;

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetSec,
    retryAfterSec: allowed ? 0 : resetSec,
  };
}

/**
 * Resolve the limit key + budget for a request given the identity we have.
 * Authenticated address takes precedence over IP; this is the seam OAuth
 * plugs into — pass the resolved address as `authAddress`.
 */
export function resolveLimit(
  cfg: RateLimitConfig,
  authAddress: string | null,
  ip: string,
): { key: string; limit: number } {
  return authAddress
    ? { key: `addr:${authAddress}`, limit: cfg.readPerWindow }
    : { key: `ip:${ip}`, limit: cfg.unauthPerWindow };
}
