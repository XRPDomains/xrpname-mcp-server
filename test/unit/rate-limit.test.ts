import { describe, it, expect } from 'vitest';
import { checkRateLimit, resolveLimit, type RateLimitConfig } from '../../src/lib/rate-limit.js';

/** Minimal in-memory incr cache mirroring MemoryCache fixed-window semantics. */
function fakeCache() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  return {
    async incr(key: string, ttlSeconds: number, nowMs = Date.now()): Promise<number> {
      const hit = store.get(key);
      if (!hit || nowMs > hit.expiresAt) {
        store.set(key, { value: 1, expiresAt: nowMs + ttlSeconds * 1000 });
        return 1;
      }
      hit.value += 1;
      return hit.value;
    },
  };
}

describe('checkRateLimit', () => {
  it('allows up to the limit, then blocks', async () => {
    const cache = fakeCache();
    const now = 1_000_000_000_000; // fixed
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit(cache, 'ip:1.2.3.4', 3, 60, now));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2]?.remaining).toBe(0);
    expect(results[3]?.retryAfterSec).toBeGreaterThan(0);
  });

  it('resets in the next window', async () => {
    const cache = fakeCache();
    const w1 = 1_000_000_000_000;
    await checkRateLimit(cache, 'k', 1, 60, w1);
    const blocked = await checkRateLimit(cache, 'k', 1, 60, w1);
    expect(blocked.allowed).toBe(false);
    // jump past the 60s window
    const allowedAgain = await checkRateLimit(cache, 'k', 1, 60, w1 + 61_000);
    expect(allowedAgain.allowed).toBe(true);
  });

  it('reports remaining correctly', async () => {
    const cache = fakeCache();
    const r = await checkRateLimit(cache, 'k2', 10, 60, 5_000);
    expect(r.remaining).toBe(9);
    expect(r.limit).toBe(10);
  });
});

describe('resolveLimit', () => {
  const cfg: RateLimitConfig = { enabled: true, readPerWindow: 60, unauthPerWindow: 30, windowSec: 60 };

  it('uses the address key + read budget when authenticated', () => {
    expect(resolveLimit(cfg, 'rAlice', '9.9.9.9')).toEqual({ key: 'addr:rAlice', limit: 60 });
  });

  it('falls back to IP key + unauth budget', () => {
    expect(resolveLimit(cfg, null, '9.9.9.9')).toEqual({ key: 'ip:9.9.9.9', limit: 30 });
  });
});
