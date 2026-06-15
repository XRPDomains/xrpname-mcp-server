/**
 * transfer_domain_tx — TX. §8.3. Build an UNSIGNED NFTokenCreateOffer (sell
 * offer, Amount 0, directed to the recipient) that transfers a domain.
 *
 * BUILD-TX-NOT-SIGN: returns the unsigned tx in three encodings. The owner signs
 * in their wallet and broadcasts via send_signed_tx; the recipient completes the
 * transfer with accept_offer_tx (or the xrpdomains.xyz pending banner).
 */
import { z } from 'zod';
import { isValidClassicAddress, encode } from 'xrpl';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { buildTransferOffer } from '../lib/tx-build.js';
import { myDomainsUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerTransferDomainTx(server: McpServer, deps: Deps): void {
  server.registerTool(
    'transfer_domain_tx',
    {
      description:
        'Build an unsigned XRPL NFTokenCreateOffer (sell offer) to transfer a domain to another wallet. ' +
        'This tool does NOT sign or broadcast — the owner signs in their wallet and submits via send_signed_tx; ' +
        'the recipient then accepts via accept_offer_tx. ' +
        'Use when the user says "send X.xrp to Y" or "transfer X.xrp to <address-or-domain>".',
      inputSchema: {
        domain: z.string().describe('The domain to transfer, e.g. "alice.xrp".'),
        destination: z
          .string()
          .describe('Recipient: an XRPL r... address or another registered domain (e.g. "bob.xrp").'),
      },
    },
    async ({ domain, destination }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError(
            'INVALID_INPUT',
            `Domain "${domain}" is not valid — ${parsed.reason}.`,
          );
        }

        const record = await deps.api.getAddress(parsed.domain);
        if (!record.owner || !record.nftokenId) {
          throw new McpToolError(
            'DOMAIN_NOT_FOUND',
            `"${parsed.domain}" is not registered, so it cannot be transferred.`,
          );
        }

        const destinationInput = destination.trim();
        const destinationAddress = await resolveDestination(destinationInput, deps);

        if (destinationAddress === record.owner) {
          throw new McpToolError('INVALID_INPUT', 'Destination is the same as the current owner.');
        }

        const built = buildTransferOffer({
          owner: record.owner,
          nftokenId: record.nftokenId,
          destination: destinationAddress,
        });
        const txHexBlob = encode(built.tx_json);

        const payload = {
          domain: parsed.domain,
          nftoken_id: record.nftokenId,
          destination_address: destinationAddress,
          destination_input: destinationInput,
          tx_json: built.tx_json,
          walletPayload: built.walletPayload,
          method_hint: built.method_hint,
          tx_hex_blob: txHexBlob,
          web_url: myDomainsUrl({ webBase: deps.config.webBase }),
          instructions:
            'Sign tx_json (or paste tx_hex_blob) in your XRPL wallet, then call send_signed_tx ' +
            'with the signed blob. The recipient must then accept the offer (accept_offer_tx). ' +
            'Or complete it in the browser at web_url.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}

/** Resolve a destination that is either an r... address or a registered domain. */
async function resolveDestination(input: string, deps: Deps): Promise<string> {
  if (isValidClassicAddress(input)) return input;

  const parsed = parseDomain(input);
  if (!parsed.ok) {
    throw new McpToolError(
      'INVALID_INPUT',
      `Destination "${input}" is neither a valid XRPL address nor a valid domain.`,
    );
  }
  const record = await deps.api.getAddress(parsed.domain);
  if (!record.owner) {
    throw new McpToolError(
      'DOMAIN_NOT_FOUND',
      `Destination domain "${parsed.domain}" is not registered, so its owner address can't be resolved.`,
    );
  }
  return record.owner;
}
