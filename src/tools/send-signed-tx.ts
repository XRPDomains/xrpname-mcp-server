/**
 * send_signed_tx — WRITE. §8.5. Broadcast a USER-SIGNED transaction blob.
 *
 * The server never signs: this only relays a blob the user already signed in
 * their own wallet (produced by a *_tx builder). It validates the hex shape,
 * submits via the XRPL client, and returns the hash + engine result.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerSendSignedTx(server: McpServer, deps: Deps): void {
  server.registerTool(
    'send_signed_tx',
    {
      description:
        'Broadcast a signed XRPL transaction blob to the network. ' +
        'Use after the user signs an unsigned transaction produced by any *_tx tool ' +
        '(transfer_domain_tx, etc.). Returns the transaction hash and broadcast result; ' +
        'then poll check_tx_status to confirm on-ledger validation.',
      inputSchema: {
        signed_tx_blob: z
          .string()
          .describe('Hex-encoded signed XRPL transaction (the output of signing a *_tx in your wallet).'),
      },
    },
    async ({ signed_tx_blob }) => {
      try {
        const result = await deps.xrpl.submitSignedBlob(signed_tx_blob.trim());
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
