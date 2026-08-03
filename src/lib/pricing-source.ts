/**
 * pricing-source.ts — consume the canonical pricing table published at
 * `xrpdomains.xyz/v3/data/pricing.json` so the MCP never drifts from the site.
 *
 * The table gives, per TLD, the XRP price for each length tier, an optional
 * per-TLD discount, and a site-wide `global_discount` (%). RLUSD prices are
 * derived by converting the XRP price with a live XRP/USD rate (RLUSD is pegged
 * 1:1 to USD) fetched from the table's `rate_sources`.
 *
 * `src/lib/pricing.ts` remains as a hardcoded fallback used only when this table
 * cannot be fetched.
 */

export interface RateSource {
  name: string;
  endpoint: string;
  jsonPath: string; // dot/array path into the response, e.g. "ripple.usd" | "last" | "6"
  timeoutMs: number;
}

export interface PricingTable {
  tiers: Record<string, { minLength: number; maxLength: number | null }>;
  tlds: Record<string, { active: boolean; pricesXrp: Record<string, number>; discountPct: number }>;
  subnameXrp: number;
  globalDiscount: { active: boolean; pct: number; validUntil: string | null } | null;
  rateSources: RateSource[];
  rateCacheTtlSec: number;
}

/** Parse the raw pricing.json into a typed table. Returns null if unusable. */
export function parsePricing(json: unknown): PricingTable | null {
  const j = json as Record<string, unknown> | undefined;
  if (!j || typeof j !== 'object' || !j.tlds || !j.tiers) return null;

  const tiers: PricingTable['tiers'] = {};
  for (const [k, v] of Object.entries(j.tiers as Record<string, Record<string, unknown>>)) {
    tiers[k] = {
      minLength: Number(v.min_length),
      maxLength: v.max_length == null ? null : Number(v.max_length),
    };
  }

  const tlds: PricingTable['tlds'] = {};
  for (const [k, v] of Object.entries(j.tlds as Record<string, Record<string, unknown>>)) {
    const prices: Record<string, number> = {};
    for (const [tier, p] of Object.entries((v.prices_xrp ?? {}) as Record<string, unknown>)) {
      prices[tier] = Number(p);
    }
    tlds[k] = {
      active: v.active !== false,
      pricesXrp: prices,
      discountPct: Number(v.discount_pct ?? 0),
    };
  }

  const gd = j.global_discount as Record<string, unknown> | undefined;
  const rs = Array.isArray(j.rate_sources) ? (j.rate_sources as Record<string, unknown>[]) : [];

  return {
    tiers,
    tlds,
    subnameXrp: Number(j.subname_xrp ?? 1),
    globalDiscount: gd
      ? { active: gd.active !== false, pct: Number(gd.pct ?? 0), validUntil: (gd.valid_until as string) ?? null }
      : null,
    rateSources: rs.map((r) => ({
      name: String(r.name ?? ''),
      endpoint: String(r.endpoint ?? ''),
      jsonPath: String(r.json_path ?? ''),
      timeoutMs: Number(r.timeout_ms ?? 2000),
    })),
    rateCacheTtlSec: Number(j.rate_cache_ttl_sec ?? 60),
  };
}

/** Which tier a domain length falls into. */
function tierKey(table: PricingTable, length: number): string | null {
  for (const [key, t] of Object.entries(table.tiers)) {
    if (length >= t.minLength && (t.maxLength == null || length <= t.maxLength)) return key;
  }
  return null;
}

/**
 * Final XRP price for a domain: tier price × (1 − per-TLD discount) × (1 −
 * global discount, when active and not expired). Returns null if the TLD/tier
 * is unknown so the caller can fall back to the local mirror.
 */
export function priceXrpFromTable(
  table: PricingTable,
  tld: string,
  length: number,
  isSubname: boolean,
  now: Date = new Date(),
): number | null {
  if (isSubname) return table.subnameXrp;
  const t = table.tlds[tld];
  if (!t || !t.active) return null;
  const key = tierKey(table, length);
  if (!key) return null;
  const gross = t.pricesXrp[key];
  if (gross == null) return null;

  let net = gross * (1 - (t.discountPct || 0) / 100);
  const g = table.globalDiscount;
  if (g && g.active && (!g.validUntil || new Date(g.validUntil) >= now)) {
    net = net * (1 - g.pct / 100);
  }
  return round6(net);
}

/** RLUSD price ≈ XRP price × XRP/USD rate (RLUSD is USD-pegged). 2 decimals. */
export function priceRlusd(priceXrpValue: number, xrpUsdRate: number): number {
  return Math.round(priceXrpValue * xrpUsdRate * 100) / 100;
}

/** Read a value out of a rate-source response by its json_path (e.g. "ripple.usd", "6"). */
export function readByPath(obj: unknown, path: string): number | null {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null) return null;
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
    else return null;
  }
  const n = Number(cur);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
