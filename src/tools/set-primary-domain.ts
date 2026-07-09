/**
 * set_primary_domain — LINK. §8.3. Returns the link to set a domain as the
 * wallet's primary on xrpdomains.xyz.
 *
 * WHY A LINK, NOT A *_tx: setting primary goes through the backend
 * `/api/xrplnft/setPrimary` (which requires an authenticated session) plus a
 * possible XRPL memo proof. The MCP can't call an auth'd backend endpoint on the
 * user's behalf, so — like register_domain — we delegate to the website's tested
 * flow, where the wallet signs.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { myDomainsUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerSetPrimaryDomain(server: McpServer, deps: Deps): void {
  server.registerTool(
    'set_primary_domain',
    {
      description:
        "Get the link to set a domain as your wallet's primary (the name shown by default for your address). " +
        'Setting primary is completed in the browser — the website handles it and your wallet signs there ' +
        '(the MCP does NOT build or broadcast the transaction). ' +
        'Use when the user says "make X.xrp my primary" or "set X.xrpfi as my main domain". ' +
        'The wallet must already own the domain.',
      inputSchema: {
        domain: z.string().describe('The domain to set as primary, e.g. "alice.xrp".'),
      },
    },
    async ({ domain }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError('INVALID_INPUT', `Domain "${domain}" is not valid — ${parsed.reason}.`);
        }
        const payload = {
          domain: parsed.domain,
          manage_url: myDomainsUrl({ webBase: deps.config.webBase }),
          instructions:
            `Open manage_url (My Domains) and set "${parsed.domain}" as your primary domain. ` +
            'The website submits the change and your connected wallet signs it there — no key or ' +
            'transaction passes through this server. You must already own the domain.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
