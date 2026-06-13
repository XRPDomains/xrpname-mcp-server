/**
 * get_domain_profile — READ. §8.2. Full public profile of one domain.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { profileUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerGetDomainProfile(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_domain_profile',
    {
      description:
        'Get the full public profile of a single XRPL domain — owner, NFT token ID, metadata, ' +
        'avatar, fullname, description, social handles, and linked chain addresses. ' +
        'Use when the user asks "show me X.xrp", "what does X.xrp link to?", or "who is X.xrp?". ' +
        'Returns null fields gracefully if the domain has no profile set.',
      inputSchema: {
        domain: z.string().describe('Domain to look up, e.g. "alice.xrp"'),
      },
    },
    async ({ domain }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError(
            'INVALID_INPUT',
            `Domain "${domain}" is not valid — ${parsed.reason}. Must end in .xrp, .xrpl, .xrpfi, or .rlusd.`,
          );
        }
        const record = await deps.api.getAddress(parsed.domain);
        const payload = {
          domain: parsed.domain,
          exists: !!record.owner,
          owner: record.owner,
          nftoken_id: record.nftokenId,
          profile: record.profile,
          addresses: record.addresses,
          profile_url: profileUrl(parsed.domain, { webBase: deps.config.webBase }),
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
