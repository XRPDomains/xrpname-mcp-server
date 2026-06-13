/**
 * check_tx_status — READ. §8.5. Validation status of an XRPL tx by hash.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerCheckTxStatus(server: McpServer, deps: Deps): void {
  server.registerTool(
    'check_tx_status',
    {
      description:
        'Check the validation status of an XRPL transaction by hash. ' +
        'Use after send_signed_tx to confirm whether the transaction was validated on-ledger. ' +
        'Returns status (pending, validated, failed, not_found) and engine result code.',
      inputSchema: {
        tx_hash: z
          .string()
          .regex(/^[A-Fa-f0-9]{64}$/, 'must be a 64-char hex transaction hash')
          .describe('64-character hex XRPL transaction hash'),
      },
    },
    async ({ tx_hash }) => {
      try {
        const result = await deps.xrpl.getTxStatus(tx_hash.toUpperCase());
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
