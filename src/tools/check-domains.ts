/**
 * check_domains — READ. §8.1. Batch 1-25 domains, availability + price + owner.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain, type InvalidDomain } from '../lib/domain-validator.js';
import { priceXrp } from '../lib/pricing.js';
import { searchUrl, profileUrl } from '../lib/web-fallback-url.js';
import { toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

const CONCURRENCY = 10;

export function registerCheckDomains(server: McpServer, deps: Deps): void {
  server.registerTool(
    'check_domains',
    {
      description:
        'Check 1 to 25 XRPL domains for registration status and cost. ' +
        'Use for questions like "is <name>.xrp taken?", "how much does <name>.xrp cost?", ' +
        '"who owns <name>.xrp?", or to verify availability before registering. ' +
        'Accepts .xrp, .xrpl, .xrpfi, .rlusd TLDs (defaults to .xrp when omitted). ' +
        'Returns availability, pricing, owner address, profile metadata if registered, ' +
        'and a web URL for the user to register if available. ' +
        'Also returns invalid_domains for inputs that fail validation.',
      inputSchema: {
        domains: z
          .array(z.string())
          .min(1)
          .max(25)
          .describe('List of domains to check. Each may include or omit the TLD; defaults to .xrp.'),
      },
    },
    async ({ domains }) => {
      try {
        const invalid: InvalidDomain[] = [];
        const valid = [];
        for (const raw of domains) {
          const parsed = parseDomain(raw);
          if (parsed.ok) valid.push(parsed);
          else invalid.push(parsed);
        }

        const results = await mapLimit(valid, CONCURRENCY, async (d) => {
          const record = await deps.api.getAddress(d.domain);
          const available = !record.owner;
          return {
            domain: d.domain,
            available,
            price_xrp: available
              ? priceXrp(d.length, d.isSubname, {
                  basePriceXrp: deps.config.basePriceXrp,
                  discountPercent: deps.config.discountPercent,
                })
              : null,
            owner: record.owner,
            nftoken_id: record.nftokenId,
            profile: available ? null : record.profile,
            web_url: available
              ? searchUrl(d.domain, { webBase: deps.config.webBase })
              : profileUrl(d.domain, { webBase: deps.config.webBase }),
            length: d.length,
            tld: d.tld,
            is_subname: d.isSubname,
          };
        });

        const payload = {
          results,
          invalid_domains: invalid.map((i) => ({ input: i.input, reason: i.reason })),
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
