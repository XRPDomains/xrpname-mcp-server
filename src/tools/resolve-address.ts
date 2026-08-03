/**
 * resolve_address — READ. Reverse resolution: XRPL address → primary XRPName +
 * all owned names. Mirrors the web `/lookup` page. Public data, no auth.
 *
 * One backend call: `getPortfolioEntries` already returns the enriched entries
 * plus the root `primary_domain` (v2), so no separate name lookup is needed.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isXrplAddress } from '../lib/domain-validator.js';
import { profileUrl, searchUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { PortfolioEntry } from '../lib/portfolio.js';
import type { Deps } from '../types/deps.js';

/** Trailing `.tld` of a domain (lowercased), or '' if none. */
function tldOf(domain: string): string {
  const m = domain.match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : '';
}

/** Build one output row for a portfolio entry. */
export function toResolvedDomain(
  entry: PortfolioEntry,
  primary: string | null,
  webBase: string,
  includeHistory: boolean,
): Record<string, unknown> {
  const tld = tldOf(entry.domain);
  const row: Record<string, unknown> = {
    domain: entry.domain,
    tld,
    length: entry.domain.slice(0, entry.domain.length - tld.length).length,
    is_primary: entry.isPrimary || entry.domain === primary,
    profile_url: profileUrl(entry.domain, { webBase }),
  };
  if (includeHistory) {
    row.nftoken_id = entry.nftokenId ?? null;
    row.mint_date = entry.mintedAt ? new Date(entry.mintedAt * 1000).toISOString() : null;
  }
  return row;
}

export function registerResolveAddress(server: McpServer, deps: Deps): void {
  server.registerTool(
    'resolve_address',
    {
      description:
        'Reverse resolution: given an XRPL address, return its primary XRPName (if set) ' +
        'and the full list of names owned by the wallet. Use when the user says ' +
        '"who owns [address]?", "look up this wallet", or "what names does [address] have?", ' +
        'or when chained with get_domain_profile to explore a wallet. ' +
        'Returns found:false if the address owns no XRPName.',
      inputSchema: {
        address: z
          .string()
          .describe('XRPL classic address, e.g. "rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn".'),
        include_history: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, include per-domain nftoken_id and mint date.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .default(100)
          .describe('Maximum number of domains to return (cap 200).'),
      },
    },
    async ({ address, include_history, limit }) => {
      try {
        if (!isXrplAddress(address)) {
          throw new McpToolError(
            'INVALID_INPUT',
            `"${address}" is not a valid XRPL classic address (must start with "r", 25-35 base58 chars).`,
          );
        }

        const web = deps.config.webBase;
        const lookupUrl = `${web}/lookup?address=${encodeURIComponent(address)}`;
        const bithompUrl = `https://bithomp.com/explorer/${encodeURIComponent(address)}`;

        const pf = await deps.api.getPortfolioEntries(address);
        const primary = pf.primaryDomain;
        const domains = pf.entries.slice(0, limit).map((e) => toResolvedDomain(e, primary, web, include_history));

        if (domains.length === 0) {
          return json({
            address,
            found: false,
            primary: null,
            primary_url: null,
            total_owned: 0,
            returned_count: 0,
            domains: [],
            message: "No XRPNames found for this address. The wallet doesn't own any names yet.",
            register_url: searchUrl('', { webBase: web }),
            web_url: lookupUrl,
            bithomp_url: bithompUrl,
          });
        }

        return json({
          address,
          found: true,
          primary: primary ?? null,
          primary_url: primary ? profileUrl(primary, { webBase: web }) : null,
          total_owned: pf.reportedTotal ?? domains.length,
          returned_count: domains.length,
          ...(pf.truncated ? { truncated: true } : {}),
          domains,
          ...(primary
            ? {}
            : {
                note:
                  "This wallet owns names but hasn't designated a primary. Any name resolves " +
                  'the address, but there is no canonical reverse-lookup name.',
              }),
          web_url: lookupUrl,
          bithomp_url: bithompUrl,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}

function json(payload: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}
