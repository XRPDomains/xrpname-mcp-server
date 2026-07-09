/**
 * recommend_domain — READ. AI-recommended domain names for a keyword/theme,
 * backed by the backend's OpenAI recommender (POST /api/domains/AIRecommend).
 * Each suggestion is cross-checked for availability + priced, with a register link.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { priceXrp } from '../lib/pricing.js';
import { searchUrl } from '../lib/web-fallback-url.js';
import { toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

const DEFAULT_TLDS = ['xrp', 'xrpl', 'xrpfi', 'rlusd'];

export interface RecommendationRaw {
  name: string;
  tld: string; // with leading dot
  category: string | null;
}

export interface Suggestion {
  domain: string;
  tld: string;
  category: string | null;
  available: boolean;
  price_xrp: number | null;
  register_url: string;
}

/** Merge AI suggestions with availability checks + pricing. Exported for tests. */
export function buildRecommendations(
  raws: RecommendationRaw[],
  checks: Array<{ domain: string; status: 'registered' | 'available' }>,
  opts: { basePriceXrp: number; discountPercent: number; webBase: string },
): Suggestion[] {
  const status = new Map(checks.map((c) => [c.domain, c.status]));
  return raws.map((r) => {
    const domain = `${r.name}${r.tld}`.toLowerCase();
    const available = status.has(domain) ? status.get(domain) === 'available' : true;
    const parsed = parseDomain(domain);
    const price =
      available && parsed.ok
        ? priceXrp(parsed.length, parsed.isSubname, {
            basePriceXrp: opts.basePriceXrp,
            discountPercent: opts.discountPercent,
          })
        : null;
    return {
      domain,
      tld: r.tld,
      category: r.category,
      available,
      price_xrp: price,
      register_url: searchUrl(domain, { webBase: opts.webBase }),
    };
  });
}

export function registerRecommendDomain(server: McpServer, deps: Deps): void {
  server.registerTool(
    'recommend_domain',
    {
      description:
        'Get AI-recommended domain suggestions for a keyword or theme (e.g. "tom", "crypto", "defi"). ' +
        'Returns creative name + TLD combos with a category, each cross-checked for availability, priced, ' +
        'and given a register link. Use when a user asks "suggest names", "find me a domain about X", ' +
        'or "give me some .xrp ideas".',
      inputSchema: {
        query: z.string().describe('Keyword or theme to base suggestions on, e.g. "tom" or "crypto".'),
        limit: z.number().int().min(1).max(25).default(8).describe('How many suggestions to return.'),
        tlds: z
          .array(z.string())
          .optional()
          .describe('TLDs to include (without dots), e.g. ["xrp","xrpfi"]. Omit for all.'),
      },
    },
    async ({ query, limit, tlds }) => {
      try {
        const tldList = tlds && tlds.length ? tlds.map((t) => t.replace(/^\./, '')) : DEFAULT_TLDS;
        const raws = await deps.api.recommendDomains(query, limit, tldList);
        const domains = raws.map((r) => `${r.name}${r.tld}`.toLowerCase());
        const checks = domains.length ? await deps.api.checkDomains(domains) : [];

        const suggestions = buildRecommendations(raws, checks, {
          basePriceXrp: deps.config.basePriceXrp,
          discountPercent: deps.config.discountPercent,
          webBase: deps.config.webBase,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ query, count: suggestions.length, suggestions }, null, 2) }],
        };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
