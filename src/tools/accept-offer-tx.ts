/**
 * accept_offer_tx — TX. §8.3. Build an UNSIGNED NFTokenAcceptOffer to accept an
 * incoming sell offer (e.g. a domain someone transferred to you).
 *
 * BUILD-TX-NOT-SIGN: the accepter signs in their wallet and broadcasts via
 * send_signed_tx. Find pending offer ids with get_pending_offers.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildAcceptOffer } from '../lib/tx-build.js';
import { encodeTx } from '../lib/tx-encode.js';
import { myDomainsUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';
import { resolveSigner } from './_signer.js';

export function registerAcceptOfferTx(server: McpServer, deps: Deps): void {
  server.registerTool(
    'accept_offer_tx',
    {
      description:
        'Build an unsigned XRPL NFTokenAcceptOffer to accept an incoming domain offer. ' +
        'This tool does NOT sign or broadcast — the user signs and submits via send_signed_tx. ' +
        'Get pending offer ids from get_pending_offers. ' +
        'Use when the user says "accept the offer for X.xrp" or "claim the domain someone sent me".',
      inputSchema: {
        offer_id: z.string().describe('The NFTokenOffer id (offer_id from get_pending_offers incoming[]).'),
        account: z
          .string()
          .optional()
          .describe('The accepting wallet (r... address). Omit to use the authenticated/dev address.'),
      },
    },
    async ({ offer_id, account }) => {
      try {
        const signer = resolveSigner(account, deps);
        const offerId = offer_id.trim();
        if (!offerId) throw new McpToolError('INVALID_INPUT', 'offer_id is required.');

        const built = buildAcceptOffer({ account: signer, offerId });
        const payload = {
          offer_id: offerId,
          account: signer,
          tx_json: built.tx_json,
          walletPayload: built.walletPayload,
          method_hint: built.method_hint,
          tx_hex_blob: encodeTx(built.tx_json),
          web_url: myDomainsUrl({ webBase: deps.config.webBase }),
          instructions:
            'Sign tx_json (or paste tx_hex_blob) in your wallet, then call send_signed_tx with the ' +
            'signed blob. Or complete it in the browser at web_url.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
