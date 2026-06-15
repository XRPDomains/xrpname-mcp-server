/**
 * Portfolio response normalisation.
 *
 * The xrpdomains.xyz `getAllNames` endpoint returns TWO different shapes
 * (verified live, 2026-06):
 *
 *   Shape A — flat string list (no pagination):
 *     { count, data: ["alice.xrp", "bob.xrpfi", ...] }
 *
 *   Shape B — rich object list (PAGINATED, limit 50):
 *     { total, limit, page, primary_domain, owner,
 *       data: [{ domain, nftoken_id, is_primary, metadata: { image, createtime, ... } }] }
 *
 * This module flattens BOTH into a common `PortfolioEntry[]`, so the client can
 * paginate Shape B and the tool can render either uniformly. Shape B also lets
 * us fill nftoken_id / image / mint time that Shape A lacks.
 */

export interface PortfolioEntry {
  domain: string;
  nftokenId: string | null;
  isPrimary: boolean;
  imageUrl: string | null;
  /** Unix seconds, from metadata.createtime when present. */
  mintedAt: number | null;
}

export interface NormalizedPage {
  entries: PortfolioEntry[];
  /** Backend's reported owned count (`total` or `count`), if any. */
  total: number | null;
  /** Page size when the response is paginated (Shape B), else null. */
  limit: number | null;
  /** Root `primary_domain` (v2 enriched shape) — lets us skip a getName call. */
  primaryDomain: string | null;
  /** v2 pagination flag; prefer over computing pages from total/limit. */
  hasNext: boolean;
}

export function normalizePortfolioPage(json: unknown): NormalizedPage {
  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const data = Array.isArray(obj.data) ? obj.data : [];
  const entries: PortfolioEntry[] = [];

  for (const item of data) {
    if (typeof item === 'string') {
      // Shape A — bare name.
      entries.push({ domain: item, nftokenId: null, isPrimary: false, imageUrl: null, mintedAt: null });
    } else if (item && typeof item === 'object') {
      // Shape B — rich object.
      const o = item as Record<string, unknown>;
      const domain = typeof o.domain === 'string' ? o.domain : null;
      if (!domain) continue;
      const meta = (o.metadata && typeof o.metadata === 'object' ? o.metadata : {}) as Record<string, unknown>;
      entries.push({
        domain,
        nftokenId: typeof o.nftoken_id === 'string' ? o.nftoken_id : null,
        isPrimary: o.is_primary === true,
        imageUrl: typeof meta.image === 'string' ? meta.image : null,
        mintedAt: parseUnixSeconds(meta.createtime),
      });
    }
  }

  return {
    entries,
    total: numOrNull(obj.total) ?? numOrNull(obj.count),
    limit: numOrNull(obj.limit),
    primaryDomain: typeof obj.primary_domain === 'string' && obj.primary_domain ? obj.primary_domain : null,
    hasNext: obj.has_next === true,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseUnixSeconds(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
