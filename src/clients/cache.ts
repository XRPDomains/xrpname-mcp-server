/**
 * Cache layer — §12.2. Redis when REDIS_URL is set, in-memory fallback
 * otherwise (Buoc 0 local dev needs zero infra).
 */
import { Redis } from 'ioredis';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  close(): Promise<void>;
}

class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
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

  async close(): Promise<void> {
    this.store.clear();
  }
}

class RedisCache implements Cache {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createCache(redisUrl: string | null): Cache {
  if (redisUrl) return new RedisCache(new Redis(redisUrl, { lazyConnect: false }));
  return new MemoryCache();
}
