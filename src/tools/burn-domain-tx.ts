/**
 * burn_domain_tx — TX. §8.3. Build an UNSIGNED NFTokenBurn that PERMANENTLY
 * destroys a domain NFT. Irreversible — the response carries a strong warning.
 *
 * BUILD-TX-NOT-SIGN: the owner signs and broadcasts via send_signed_tx.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { buildBurn } from '../lib/tx-build.js';
import { encodeTx } from '../lib/tx-encode.js';
import { profileUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerBurnDomainTx(server: McpServer, deps: Deps): void {
  server.registerTool(
    'burn_domain_tx',
    {
      description:
        'Build an unsigned XRPL NFTokenBurn that PERMANENTLY destroys a domain NFT. ' +
        'This is IRREVERSIBLE — the domain is gone forever and must be re-registered to recover. ' +
        'This tool does NOT sign or broadcast; the owner signs and submits via send_signed_tx. ' +
        'Only use when the user explicitly confirms they want to destroy the domain.',
      inputSchema: {
        domain: z.string().describe('The domain to burn, e.g. "alice.xrp".'),
      },
    },
    async ({ domain }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError('INVALID_INPUT', `Domain "${domain}" is not valid — ${parsed.reason}.`);
        }

        const record = await deps.api.getAddress(parsed.domain);
        if (!record.owner || !record.nftokenId) {
          throw new McpToolError(
            'DOMAIN_NOT_FOUND',
            `"${parsed.domain}" is not registered, so there is nothing to burn.`,
          );
        }

        const built = buildBurn({ owner: record.owner, nftokenId: record.nftokenId });
        const payload = {
          domain: parsed.domain,
          nftoken_id: record.nftokenId,
          owner: record.owner,
          tx_json: built.tx_json,
          walletPayload: built.walletPayload,
          method_hint: built.method_hint,
          tx_hex_blob: encodeTx(built.tx_json),
          web_url: profileUrl(parsed.domain, { webBase: deps.config.webBase }),
          instructions:
            '⚠️ WARNING: Burning PERMANENTLY destroys this domain NFT and CANNOT be undone. ' +
            'Only proceed if the user has explicitly confirmed. To continue, sign tx_json (or tx_hex_blob) ' +
            'in your wallet, then call send_signed_tx with the signed blob.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
