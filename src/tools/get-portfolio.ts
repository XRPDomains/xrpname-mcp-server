/**
 * get_portfolio — READ. §8.2. List all XRPL domains owned by a wallet.
 *
 * Identity (Phase 1): `address` is REQUIRED, same as get_pending_offers. OAuth
 * (Phase 3) will let it default to the authenticated address.
 *
 * Backend: GET /api/xrplnft/getAllNames?address=... returns a flat array of
 * domain name STRINGS (verified live). It does NOT include nftoken_id / image /
 * mint time, so those fields are returned as null — call get_domain_profile for
 * a single domain's full detail. The list can contain junk (e.g. a stray
 * "api/xrplnft/getAddress?domain=..." entry) and exotic TLDs (.rlusd) plus emoji
 * domains, so parsing is permissive-but-defensive: drop anything that isn't a
 * clean `name.tld`, but keep every legitimately owned domain.
 */
import { z } from 'zod';
import { isValidClassicAddress } from 'xrpl';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { profileUrl, myDomainsUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export type PortfolioSort = 'recent' | 'length-asc' | 'length-desc' | 'name-asc';

export interface PortfolioDomain {
  domain: string;
  nftoken_id: string | null;
  is_primary: boolean;
  length: number;
  tld: string;
  is_subname: boolean;
  image_url: string | null;
  minted_at: number | null;
  profile_url: string;
  manage_url: string;
}

export interface ParsedName {
  domain: string;
  /** TLD WITH leading dot, e.g. ".xrp", ".rlusd". */
  tld: string;
  /** Code-point length of the first label (emoji-aware). */
  length: number;
  isSubname: boolean;
}

// Reject URL/path/query junk and whitespace; real domains never contain these.
const JUNK_RE = /[/\\?=#&\s]/;

/**
 * Parse one raw name from getAllNames into a structured domain, or null if it
 * isn't a clean `name.tld`. Permissive on charset (keeps emoji/unicode domains),
 * strict on structure. Exported for unit testing.
 */
export function parsePortfolioName(raw: string): ParsedName | null {
  const d = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!d || JUNK_RE.test(d)) return null;
  if (d.startsWith('.') || d.endsWith('.') || !d.includes('.')) return null;

  const idx = d.lastIndexOf('.');
  const suffix = d.slice(idx + 1);
  const namePart = d.slice(0, idx);
  if (!suffix || !namePart) return null;

  const labels = namePart.split('.');
  if (labels.some((l) => l.length === 0)) return null;

  const firstLabel = labels[0] ?? '';
  return {
    domain: d,
    tld: `.${suffix}`,
    length: [...firstLabel].length,
    isSubname: labels.length > 1,
  };
}

const SORTERS: Record<PortfolioSort, (a: PortfolioDomain, b: PortfolioDomain) => number> = {
  'name-asc': (a, b) => a.domain.localeCompare(b.domain),
  'length-asc': (a, b) => a.length - b.length || a.domain.localeCompare(b.domain),
  'length-desc': (a, b) => b.length - a.length || a.domain.localeCompare(b.domain),
  // No mint timestamp from this endpoint → "recent" preserves backend order.
  recent: () => 0,
};

/** Build the full portfolio payload from raw names. Exported for unit testing. */
export function buildPortfolio(
  address: string,
  names: string[],
  primary: string | null,
  opts: { sort: PortfolioSort; filterTld: string; limit: number; webBase: string },
): {
  address: string;
  total: number;
  primary_domain: string | null;
  returned: number;
  domains: PortfolioDomain[];
} {
  const primaryLc = primary ? primary.trim().toLowerCase() : null;
  const wantTld = opts.filterTld.toLowerCase();

  let parsed = names
    .map(parsePortfolioName)
    .filter((p): p is ParsedName => p !== null);

  if (wantTld !== 'all') {
    const tldNorm = wantTld.startsWith('.') ? wantTld : `.${wantTld}`;
    parsed = parsed.filter((p) => p.tld === tldNorm);
  }

  const domains: PortfolioDomain[] = parsed.map((p) => ({
    domain: p.domain,
    nftoken_id: null,
    is_primary: p.domain === primaryLc,
    length: p.length,
    tld: p.tld,
    is_subname: p.isSubname,
    image_url: null,
    minted_at: null,
    profile_url: profileUrl(p.domain, { webBase: opts.webBase }),
    manage_url: myDomainsUrl({ webBase: opts.webBase }),
  }));

  if (opts.sort !== 'recent') domains.sort(SORTERS[opts.sort]);

  const limited = domains.slice(0, opts.limit);
  return {
    address,
    total: domains.length,
    primary_domain: primary ?? null,
    returned: limited.length,
    domains: limited,
  };
}

export function registerGetPortfolio(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_portfolio',
    {
      description:
        'List all XRPL domains owned by a wallet address. ' +
        'Use when the user asks "what domains do I own?", "show me my domains", ' +
        "or wants to see another wallet's holdings. " +
        'Returns each domain with its TLD, length, primary flag, subname flag, and quick-action URLs. ' +
        '(nftoken_id, image, and mint time are not included here — use get_domain_profile for one domain.) ' +
        'Requires an XRPL r... address.',
      inputSchema: {
        address: z
          .string()
          .describe('XRPL r... address whose domains to list.'),
        sort: z
          .enum(['recent', 'length-asc', 'length-desc', 'name-asc'])
          .default('recent')
          .describe('Sort order. "recent" keeps the backend order.'),
        filter_tld: z
          .string()
          .default('all')
          .describe('Filter by TLD, e.g. ".xrp", ".xrpfi", ".rlusd", or "all".'),
        limit: z.number().int().min(1).max(200).default(50).describe('Max domains to return.'),
      },
    },
    async ({ address, sort, filter_tld, limit }) => {
      try {
        if (!isValidClassicAddress(address)) {
          throw new McpToolError(
            'INVALID_INPUT',
            `"${address}" is not a valid XRPL classic address. Expected an r... address.`,
          );
        }

        const [names, primary] = await Promise.all([
          deps.api.getAllNames(address),
          deps.api.getName(address),
        ]);

        const payload = buildPortfolio(address, names, primary, {
          sort,
          filterTld: filter_tld,
          limit,
          webBase: deps.config.webBase,
        });
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
