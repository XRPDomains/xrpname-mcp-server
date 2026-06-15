/**
 * get_domain_profile — READ. §8.2 (v2). Full public profile of one domain,
 * optionally with the on-chain ownership history (include_history=true), served
 * by a single getAddress?include=history call.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { profileUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export interface HistoryEvent {
  owner: string | null;
  changed_at: number | null;
  ledger_index: number | null;
  tx_hash: string | null;
  marketplace: string | null;
  owner_username: string | null;
}

/** Map the raw history array (from getAddress?include=history). Exported for tests. */
export function mapHistory(raw: unknown[]): HistoryEvent[] {
  return raw.map((item) => {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const details = (o.ownerDetails && typeof o.ownerDetails === 'object' ? o.ownerDetails : {}) as Record<
      string,
      unknown
    >;
    return {
      owner: typeof o.owner === 'string' ? o.owner : null,
      changed_at: typeof o.changedAt === 'number' ? o.changedAt : null,
      ledger_index: typeof o.ledgerIndex === 'number' ? o.ledgerIndex : null,
      tx_hash: typeof o.txHash === 'string' ? o.txHash : null,
      marketplace: typeof o.marketplace === 'string' ? o.marketplace : null,
      owner_username: typeof details.username === 'string' ? details.username : null,
    };
  });
}

export function registerGetDomainProfile(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_domain_profile',
    {
      description:
        'Get the full public profile of a single XRPL domain — owner, NFT token ID, metadata, ' +
        'avatar, fullname, description, social handles, linked chain addresses, and optionally ' +
        'the on-chain ownership history (pass include_history=true). ' +
        'Use when the user asks "show me X.xrp", "what does X.xrp link to?", "who owns X.xrp?", ' +
        'or "show me the history of X.xrp". Returns null fields gracefully if no profile is set.',
      inputSchema: {
        domain: z.string().describe('Domain to look up, e.g. "alice.xrp"'),
        include_history: z
          .boolean()
          .default(false)
          .describe('Include the on-chain ownership timeline (transfers, marketplace sales).'),
      },
    },
    async ({ domain, include_history }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError(
            'INVALID_INPUT',
            `Domain "${domain}" is not valid — ${parsed.reason}. Must end in .xrp, .xrpl, .xrpfi, or .rlusd.`,
          );
        }
        const record = await deps.api.getAddress(parsed.domain, include_history);
        const payload = {
          domain: parsed.domain,
          exists: !!record.owner,
          owner: record.owner,
          nftoken_id: record.nftokenId,
          profile: record.profile,
          addresses: record.addresses,
          history: include_history ? mapHistory(record.history ?? []) : null,
          profile_url: profileUrl(parsed.domain, { webBase: deps.config.webBase }),
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
