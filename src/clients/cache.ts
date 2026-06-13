/**
 * Cache layer — §12.2. Redis when REDIS_URL is set, in-memory fallback
 * otherwise (Buoc 0 local dev needs zero infra).
 */
import { Redis } from 'ioredis';
import { metrics } from '../lib/metrics.js';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /**
   * Atomically increment a counter and return the new value. Sets the TTL on
   * the first increment of a fresh key (fixed-window semantics). Backs the
   * rate limiter (src/lib/rate-limit.ts).
   */
  incr(key: string, ttlSeconds: number): Promise<number>;
  close(): Promise<void>;
}

class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) {
      metrics.recordCache('miss');
      return null;
    }
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      metrics.recordCache('miss');
      return null;
    }
    metrics.recordCache('hit');
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (this.store.size > 5000) {
      // cheap eviction: drop expired entries
      const now = Date.now();
      for (const [k, v] of this.store) if (now > v.expiresAt) this.store.delete(k);
    }
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.store.delete(k);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (!hit || now > hit.expiresAt) {
      this.store.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = (typeof hit.value === 'number' ? hit.value : 0) + 1;
    hit.value = next; // keep original expiresAt → fixed window
    return next;
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

class RedisCache implements Cache {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    metrics.recordCache(raw === null ? 'miss' : 'hit');
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const next = await this.redis.incr(key);
    // Set TTL only when the key was just created, so the window doesn't slide.
    if (next === 1) await this.redis.expire(key, ttlSeconds);
    return next;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createCache(redisUrl: string | null): Cache {
  if (redisUrl) return new RedisCache(new Redis(redisUrl, { lazyConnect: false }));
  return new MemoryCache();
}
