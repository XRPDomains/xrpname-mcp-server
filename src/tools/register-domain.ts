/**
 * register_domain — READ/LINK. §8.1. Returns the link to register a domain on
 * xrpdomains.xyz, rather than building an unsigned Payment in the MCP.
 *
 * WHY A LINK, NOT A *_tx: on-chain registration needs a backend `createOrder`
 * callback plus an exact price/memo match for the Payment. Getting that wrong on
 * mainnet means real XRP spent with no minted NFT. The website already owns that
 * flow (order creation + wallet signing), so we delegate to it — the safe choice
 * (same pattern as SNS's web_register_url and check_domains' web_url).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { priceXrp } from '../lib/pricing.js';
import { searchUrl, profileUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerRegisterDomain(server: McpServer, deps: Deps): void {
  server.registerTool(
    'register_domain',
    {
      description:
        'Get the link to register a .xrp / .xrpl / .xrpfi / .rlusd domain on xrpdomains.xyz. ' +
        'Registration is completed in the browser — the website handles the order and the user signs ' +
        'in their wallet there (the MCP does NOT build or broadcast the payment). ' +
        'Use when the user says "register X.xrpfi" or "buy X.xrp". Pass refcode if a referral applies.',
      inputSchema: {
        domain: z.string().describe('The domain to register, e.g. "coolname.xrpfi".'),
        refcode: z.string().optional().describe('Optional referral code to embed in the registration link.'),
      },
    },
    async ({ domain, refcode }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError('INVALID_INPUT', `Domain "${domain}" is not valid — ${parsed.reason}.`);
        }

        const [check] = await deps.api.checkDomains([parsed.domain]);
        const available = check ? check.status === 'available' : true;

        if (!available) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    domain: parsed.domain,
                    available: false,
                    owner: check?.owner ?? null,
                    message: `"${parsed.domain}" is already registered — it can't be registered again.`,
                    profile_url: profileUrl(parsed.domain, { webBase: deps.config.webBase }),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const payload = {
          domain: parsed.domain,
          available: true,
          price_xrp: priceXrp(parsed.length, parsed.isSubname, {
            basePriceXrp: deps.config.basePriceXrp,
            discountPercent: deps.config.discountPercent,
          }),
          tld: parsed.tld,
          length: parsed.length,
          register_url: searchUrl(parsed.domain, { webBase: deps.config.webBase }, refcode),
          instructions:
            'Open register_url to complete registration on xrpdomains.xyz. The website creates the order ' +
            'and your connected wallet signs the payment there — no key or payment passes through this server. ' +
            `Estimated price shown is ~price_xrp XRP (final amount is confirmed on the website).`,
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
