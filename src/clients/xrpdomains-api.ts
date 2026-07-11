/**
 * Wrapper around the public xrpdomains.xyz REST API — pure consumer (§10).
 * Endpoints consumed: getAddress, checkDomains, getAllNames, getPendingDomains,
 * getOrderbyDomain, and AIRecommend (paths in src/lib/api-endpoints.ts).
 */
import { McpToolError } from '../lib/errors.js';
import { ApiEndpoints, type EndpointSet } from '../lib/api-endpoints.js';
import { normalizePortfolioPage, type PortfolioEntry } from '../lib/portfolio.js';
import type { Cache } from './cache.js';

const TIMEOUT_MS = 15_000;
const PORTFOLIO_PAGE_SIZE = 50;
/** Safety cap on portfolio pagination (50/page × 20 = 1000 domains). */
const MAX_PORTFOLIO_PAGES = 20;

export interface DomainRecord {
  owner: string | null;
  nftokenId: string | null;
  profile: Record<string, unknown> | null;
  addresses: unknown[] | null;
  /** On-chain ownership timeline — present only when requested via include=history. */
  history: unknown[] | null;
  raw: Record<string, unknown>;
}

export interface DomainCheck {
  domain: string;
  status: 'registered' | 'available';
  owner: string | null;
  nftokenId: string | null;
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

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status >= 500) {
        throw new McpToolError('BACKEND_UNAVAILABLE', 'XRPName is temporarily unavailable.');
      }
      if (!res.ok) throw new McpToolError('BACKEND_UNAVAILABLE', `Backend returned HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err instanceof McpToolError) throw err;
      throw new McpToolError('BACKEND_UNAVAILABLE', 'Could not reach xrpdomains.xyz backend.');
    } finally {
      clearTimeout(t);
    }
  }

  /** AI-recommended domain names for a keyword/theme. Returns raw suggestion rows. */
  async recommendDomains(
    query: string,
    limit: number,
    tlds: string[],
  ): Promise<Array<{ name: string; tld: string; category: string | null }>> {
    const json = (await this.postJson(this.endpoints.aiRecommend(), { query, limit, tlds })) as {
      data?: unknown;
    };
    const rows = Array.isArray(json?.data) ? json.data : [];
    const out: Array<{ name: string; tld: string; category: string | null }> = [];
    for (const r of rows) {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const name = pickString(o, ['Domain', 'domain', 'name']);
      const tldRaw = pickString(o, ['Tld', 'tld', 'TLD']);
      if (!name || !tldRaw) continue;
      out.push({
        name,
        tld: tldRaw.startsWith('.') ? tldRaw : `.${tldRaw}`,
        category: pickString(o, ['Category', 'category']),
      });
    }
    return out;
  }

  /** Backend order state for a domain (null when no order on file). Cached 10s. */
  async getOrderByDomain(domain: string): Promise<Record<string, unknown> | null> {
    const key = `mcp:getOrderByDomain:${domain}`;
    const cached = await this.cache.get<Record<string, unknown> | null>(key);
    if (cached !== null) return cached;

    const json = (await this.fetchJson(this.endpoints.getOrderByDomain(domain))) as { data?: unknown };
    const data = json?.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : null;
    await this.cache.set(key, data, 10);
    return data;
  }

  /** Resolve domain → owner + nftoken_id + profile (+ history). Cached 60s (§12.2). */
  async getAddress(domain: string, includeHistory = false): Promise<DomainRecord> {
    const key = includeHistory ? `mcp:getAddress:${domain}:history` : `mcp:getAddress:${domain}`;
    const cached = await this.cache.get<DomainRecord>(key);
    if (cached) return cached;

    const json = (await this.fetchJson(this.endpoints.getAddress(domain, includeHistory))) as {
      data?: Record<string, unknown>;
    };

    const d = json?.data ?? {};
    const record: DomainRecord = {
      owner: pickString(d, ['owner', 'Owner', 'address']),
      nftokenId: pickString(d, ['nftoken_id', 'nftokenId', 'NFTokenID', 'nftid']),
      profile:
        (d.profile as Record<string, unknown> | undefined) ??
        (d.profile_info as Record<string, unknown> | undefined) ??
        extractProfile(d),
      addresses: (d.addresses as unknown[] | undefined) ?? null,
      history: Array.isArray(d.history) ? d.history : null,
      raw: d,
    };

    await this.cache.set(key, record, 60);
    return record;
  }

  /**
   * v2 (E26): batch availability check. One call returns status per domain.
   * Cached 60s keyed by the sorted domain set.
   */
  async checkDomains(domains: string[]): Promise<DomainCheck[]> {
    if (domains.length === 0) return [];
    const key = `mcp:checkDomains:${[...domains].sort().join(',')}`;
    const cached = await this.cache.get<DomainCheck[]>(key);
    if (cached) return cached;

    const json = (await this.fetchJson(this.endpoints.checkDomains(domains))) as { data?: unknown };
    const rows = Array.isArray(json?.data) ? json.data : [];
    const result: DomainCheck[] = rows.map((r) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const status = o.status === 'registered' ? 'registered' : 'available';
      return {
        domain: typeof o.domain === 'string' ? o.domain : '',
        status,
        owner: typeof o.owner === 'string' && o.owner ? o.owner : null,
        nftokenId: typeof o.nftoken_id === 'string' && o.nftoken_id ? o.nftoken_id : null,
      };
    });
    await this.cache.set(key, result, 60);
    return result;
  }

  /**
   * Domains owned by an address (portfolio). Normalises both backend response
   * shapes (flat strings | rich paginated objects) and follows pagination up to
   * a safety cap. Cached 30s (§12.2).
   */
  async getPortfolioEntries(address: string): Promise<{
    entries: PortfolioEntry[];
    reportedTotal: number | null;
    primaryDomain: string | null;
    truncated: boolean;
  }> {
    const key = `mcp:getAllNames:${address}:all`;
    type Result = { entries: PortfolioEntry[]; reportedTotal: number | null; primaryDomain: string | null; truncated: boolean };
    const cached = await this.cache.get<Result>(key);
    if (cached) return cached;

    const first = normalizePortfolioPage(
      await this.fetchJson(this.endpoints.getAllNames(address, 1, PORTFOLIO_PAGE_SIZE)),
    );
    let entries = first.entries;
    let truncated = false;

    // Paginate robustly: continue while the backend says there's more (has_next)
    // OR the page came back full (so there may be more). Stop on a short/empty
    // page. The `total` field is unreliable across backend variants, so we don't
    // trust it for page math.
    let page = 1;
    let more = first.hasNext || first.entries.length >= PORTFOLIO_PAGE_SIZE;
    while (more) {
      if (page >= MAX_PORTFOLIO_PAGES) {
        truncated = true;
        break;
      }
      page += 1;
      const next = normalizePortfolioPage(
        await this.fetchJson(this.endpoints.getAllNames(address, page, PORTFOLIO_PAGE_SIZE)),
      );
      if (next.entries.length === 0) break;
      entries = entries.concat(next.entries);
      more = next.hasNext || next.entries.length >= PORTFOLIO_PAGE_SIZE;
    }

    const result: Result = {
      entries,
      reportedTotal: first.total,
      primaryDomain: first.primaryDomain,
      truncated,
    };
    await this.cache.set(key, result, 30);
    return result;
  }

  /**
   * v2 (E25): pending domain operations for a wallet in one atomic snapshot —
   * paid-but-unminted, incoming offers, outgoing offers. Cached 10s (§12.2).
   * Replaces the legacy getOfferByDestination + getOfferByOwner pair.
   */
  async getPendingDomains(owner: string): Promise<{
    mint: unknown[];
    incoming: unknown[];
    outgoing: unknown[];
  }> {
    const key = `mcp:getPendingDomains:${owner}`;
    const cached = await this.cache.get<{ mint: unknown[]; incoming: unknown[]; outgoing: unknown[] }>(key);
    if (cached) return cached;

    const json = (await this.fetchJson(this.endpoints.getPendingDomains(owner))) as {
      data?: { mint?: unknown; incoming?: unknown; outgoing?: unknown };
    };
    const d = json?.data ?? {};
    const result = {
      mint: Array.isArray(d.mint) ? d.mint : [],
      incoming: Array.isArray(d.incoming) ? d.incoming : [],
      outgoing: Array.isArray(d.outgoing) ? d.outgoing : [],
    };
    await this.cache.set(key, result, 10);
    return result;
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
