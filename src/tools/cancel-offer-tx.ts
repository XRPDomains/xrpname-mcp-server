/**
 * cancel_offer_tx — TX. §8.3. Build an UNSIGNED NFTokenCancelOffer to cancel
 * your own outstanding offer(s) — e.g. revoke a pending outgoing transfer.
 *
 * BUILD-TX-NOT-SIGN: the owner signs and broadcasts via send_signed_tx. Get
 * outgoing offer ids from get_pending_offers.
 */
import { z } from 'zod';
import { encode } from 'xrpl';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildCancelOffer } from '../lib/tx-build.js';
import { myDomainsUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';
import { resolveSigner } from './_signer.js';

export function registerCancelOfferTx(server: McpServer, deps: Deps): void {
  server.registerTool(
    'cancel_offer_tx',
    {
      description:
        'Build an unsigned XRPL NFTokenCancelOffer to cancel your own pending offer(s) — ' +
        'e.g. revoke an outgoing domain transfer you no longer want. ' +
        'This tool does NOT sign or broadcast; the owner signs and submits via send_signed_tx. ' +
        'Get offer ids from get_pending_offers outgoing[].',
      inputSchema: {
        offer_ids: z
          .array(z.string())
          .min(1)
          .describe('One or more NFTokenOffer ids to cancel (from get_pending_offers outgoing[]).'),
        account: z
          .string()
          .optional()
          .describe('The wallet that owns the offers (r... address). Omit to use the authenticated/dev address.'),
      },
    },
    async ({ offer_ids, account }) => {
      try {
        const signer = resolveSigner(account, deps);
        const offerIds = offer_ids.map((o) => o.trim()).filter(Boolean);
        if (offerIds.length === 0) throw new McpToolError('INVALID_INPUT', 'At least one offer id is required.');

        const built = buildCancelOffer({ account: signer, offerIds });
        const payload = {
          offer_ids: offerIds,
          account: signer,
          tx_json: built.tx_json,
          walletPayload: built.walletPayload,
          method_hint: built.method_hint,
          tx_hex_blob: encode(built.tx_json),
          web_url: myDomainsUrl({ webBase: deps.config.webBase }),
          instructions:
            'Sign tx_json (or paste tx_hex_blob) in your wallet, then call send_signed_tx with the signed blob.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
