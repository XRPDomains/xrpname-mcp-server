/**
 * check_order_status — READ. Backend order state for a domain the user tried to
 * register (GET /api/xrplnft/getOrderbyDomain). Answers "did my registration go
 * through?" — deeper than check_domains (availability only).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDomain } from '../lib/domain-validator.js';
import { profileUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function registerCheckOrderStatus(server: McpServer, deps: Deps): void {
  server.registerTool(
    'check_order_status',
    {
      description:
        'Check the backend order status for a domain you tried to register on xrpdomains.xyz. ' +
        'Returns whether payment landed, the offer was created, the mint completed, or it failed at a step. ' +
        'Use when a user asks "did my X.xrp registration go through?" or "what\'s the status of my order?". ' +
        'This is deeper than check_domains (which only shows availability).',
      inputSchema: {
        domain: z.string().describe('The domain whose order to check, e.g. "alice.xrp".'),
      },
    },
    async ({ domain }) => {
      try {
        const parsed = parseDomain(domain);
        if (!parsed.ok) {
          throw new McpToolError('INVALID_INPUT', `Domain "${domain}" is not valid — ${parsed.reason}.`);
        }

        const order = await deps.api.getOrderByDomain(parsed.domain);
        if (!order) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    domain: parsed.domain,
                    order: null,
                    message:
                      'No active order on file — the domain may not have been registered via the order flow, ' +
                      'or the order already completed. Use check_domains to see current ownership.',
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
          order: {
            status: str(order, 'status'),
            payment_tx: str(order, 'payment_tx'),
            offer_id: str(order, 'offer_id'),
            mint_tx: str(order, 'mint_tx'),
            created_at: str(order, 'created_at'),
          },
          profile_url: profileUrl(parsed.domain, { webBase: deps.config.webBase }),
          raw: order,
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}

function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number') return String(v);
  return null;
}
