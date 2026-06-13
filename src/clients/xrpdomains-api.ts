/**
 * Wrapper around the public xrpdomains.xyz REST API — pure consumer (§10).
 * Response shapes verified against v3/js/v3-nft-tx.js + API audit:
 *   GET /api/xrplnft/getAddress?domain=alice.xrp → { data: { owner: "r...", ... } }
 *   GET /api/xrplnft/getName?address=r...        → { data: "<domain or empty>" }
 *   GET /api/xrplnft/getOfferByDestination?address=r... (incoming offers)
 *   GET /api/xrplnft/getOfferByOwner?address=r...       (outgoing offers)
 */
import { McpToolError } from '../lib/errors.js';
import { ApiEndpoints, type EndpointSet } from '../lib/api-endpoints.js';
import type { Cache } from './cache.js';

const TIMEOUT_MS = 15_000;

export interface DomainRecord {
  owner: string | null;
  nftokenId: string | null;
  profile: Record<string, unknown> | null;
  addresses: unknown[] | null;
  raw: Record<string, unknown>;
}

export class XrpDomainsApi {
  constructor(
    private readonly base: string,
    private readonly cache: Cache,
    /** Path registry — defaults to the active version (src/lib/api-endpoints.ts).
     *  Injectable so v2 / tests can supply a different scheme without code edits. */
    private readonly endpoints: EndpointSet = ApiEndpoints,
  ) {}

  private async fetchJson(path: string): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.base + path, { signal: ctrl.signal });
      if (res.status >= 500) {
        throw new McpToolError(
          'BACKEND_UNAVAILABLE',
          'XRPName is temporarily unavailable. Please try again in a minute.',
        );
      }
      if (!res.ok) {
        throw new McpToolError('BACKEND_UNAVAILABLE', `Backend returned HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (err instanceof McpToolError) throw err;
      throw new McpToolError(
        'BACKEND_UNAVAILABLE',
        'Could not reach xrpdomains.xyz backend (network error or timeout).',
      );
    } finally {
      clearTimeout(t);
    }
  }

  /** Resolve domain → owner + nftoken_id + profile. Cached 60s (§12.2). */
  async getAddress(domain: string): Promise<DomainRecord> {
    const key = `mcp:getAddress:${domain}`;
    const cached = await this.cache.get<DomainRecord>(key);
    if (cached) return cached;

    const json = (await this.fetchJson(this.endpoints.getAddress(domain))) as {
      data?: Record<string, unknown>;
    };

    const d = json?.data ?? {};
    const record: DomainRecord = {
      owner: pickString(d, ['owner', 'Owner', 'address']),
      nftokenId: pickString(d, ['nftoken_id', 'nftokenId', 'NFTokenID', 'nftid']),
      profile: (d.profile as Record<string, unknown> | undefined) ?? extractProfile(d),
      addresses: (d.addresses as unknown[] | undefined) ?? null,
      raw: d,
    };

    await this.cache.set(key, record, 60);
    return record;
  }

  /** Reverse: address → primary domain string. Cached 60s. */
  async getName(address: string): Promise<string | null> {
    const key = `mcp:getName:${address}`;
    const cached = await this.cache.get<string | null>(key);
    if (cached !== null) return cached || null;

    const json = (await this.fetchJson(this.endpoints.getName(address))) as {
      data?: unknown;
    };

    const name = typeof json?.data === 'string' ? json.data : '';
    await this.cache.set(key, name, 60);
    return name || null;
  }

  /** Incoming offers (user is recipient). Cached 10s. */
  async getOffersByDestination(address: string): Promise<unknown[]> {
    return this.fetchOffers('getOfferByDestination', this.endpoints.getOfferByDestination(address), address);
  }

  /** Outgoing offers (user is sender/owner). Cached 10s. */
  async getOffersByOwner(address: string): Promise<unknown[]> {
    return this.fetchOffers('getOfferByOwner', this.endpoints.getOfferByOwner(address), address);
  }

  /**
   * @param cacheName stable logical name for the cache key (version-independent,
   *                  so cache keys don't shift if v2 renames the path).
   * @param path      already-built request path from the endpoint registry.
   */
  private async fetchOffers(cacheName: string, path: string, address: string): Promise<unknown[]> {
    const key = `mcp:${cacheName}:${address}`;
    const cached = await this.cache.get<unknown[]>(key);
    if (cached) return cached;

    const json = (await this.fetchJson(path)) as { data?: unknown };

    const list = Array.isArray(json?.data) ? json.data : [];
    await this.cache.set(key, list, 10);
    return list;
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

/** Backend may inline profile fields on data — collect known ones. */
const PROFILE_KEYS = [
  'fullname',
  'description',
  'avatar',
  'cover',
  'twitter',
  'facebook',
  'telegram',
  'discord',
  'github',
  'website',
  'email',
  'location',
];

function extractProfile(d: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) {
    if (typeof d[k] === 'string' && d[k]) out[k] = d[k];
  }
  return Object.keys(out).length ? out : null;
}
