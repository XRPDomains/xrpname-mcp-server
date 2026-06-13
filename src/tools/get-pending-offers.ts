/**
 * get_pending_offers — READ. §8.2. Pending XRPL NFToken offers for a wallet:
 * incoming (someone offered the wallet a domain) + outgoing (the wallet listed
 * a domain for transfer).
 *
 * Identity (Bước 1): `address` is REQUIRED — the caller must pass the wallet to
 * query. When OAuth lands (Bước 3) we'll default to the authenticated address.
 *
 * Backend: GET /api/xrplnft/getOfferByDestination + getOfferByOwner, run in
 * parallel (paths live in src/lib/api-endpoints.ts). Backend team may later ship
 * a unified /api/xrplnft/getPending — swapping it is a registry-only change.
 *
 * NOTE: the exact field names on each raw offer object are NOT yet verified
 * against the live backend. `mapOffer` extracts defensively (tries several key
 * spellings) and passes the untouched `raw` object through so nothing is lost.
 * TODO(verify-backend): confirm field names, then tighten the key lists below.
 */
import { z } from 'zod';
import { isValidClassicAddress } from 'xrpl';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { myDomainsUrl } from '../lib/web-fallback-url.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export interface PendingOffer {
  domain: string | null;
  nftoken_id: string | null;
  offer_id: string | null;
  /** Counterparty: who made the offer (incoming) / where it's headed (outgoing). */
  counterparty: string | null;
  expiration: number | null;
  amount_drops: string | null;
  raw: Record<string, unknown>;
}

const OFFER_ID_KEYS = ['offer_id', 'offerId', 'nft_offer_index', 'NFTokenOfferID', 'OfferID', 'index'];
const NFT_ID_KEYS = ['nftoken_id', 'nftokenId', 'NFTokenID', 'nftid'];
const DOMAIN_KEYS = ['domain', 'name', 'Domain', 'Name'];
const NFT_AMOUNT_KEYS = ['amount_drops', 'amount', 'Amount'];
const EXPIRATION_KEYS = ['expiration', 'Expiration', 'expires_at'];
const SENDER_KEYS = ['sender', 'owner', 'Owner', 'account', 'Account', 'from'];
const DESTINATION_KEYS = ['destination', 'Destination', 'to'];

/**
 * Map one raw backend offer to the stable PendingOffer shape.
 * @param counterpartyKeys which keys hold the "other party" for this direction.
 * Exported for unit testing.
 */
export function mapOffer(raw: unknown, counterpartyKeys: string[]): PendingOffer {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    domain: pickStr(o, DOMAIN_KEYS),
    nftoken_id: pickStr(o, NFT_ID_KEYS),
    offer_id: pickStr(o, OFFER_ID_KEYS),
    counterparty: pickStr(o, counterpartyKeys),
    expiration: pickNum(o, EXPIRATION_KEYS),
    amount_drops: pickStr(o, NFT_AMOUNT_KEYS),
    raw: o,
  };
}

/** Build the full tool payload from the two raw offer lists. Exported for tests. */
export function buildPendingPayload(
  address: string,
  incomingRaw: unknown[],
  outgoingRaw: unknown[],
  manageUrl: string,
): {
  address: string;
  incoming: PendingOffer[];
  outgoing: PendingOffer[];
  counts: { incoming: number; outgoing: number; total: number };
  manage_url: string;
} {
  const incoming = incomingRaw.map((r) => mapOffer(r, SENDER_KEYS));
  const outgoing = outgoingRaw.map((r) => mapOffer(r, DESTINATION_KEYS));
  return {
    address,
    incoming,
    outgoing,
    counts: { incoming: incoming.length, outgoing: outgoing.length, total: incoming.length + outgoing.length },
    manage_url: manageUrl,
  };
}

export function registerGetPendingOffers(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_pending_offers',
    {
      description:
        'Get all pending XRPL NFToken offers for a wallet — both incoming (someone offered the ' +
        'wallet a domain) and outgoing (the wallet listed a domain for transfer). ' +
        'Use when the user asks "do I have any pending transfers?", "what offers are waiting on me?", ' +
        'or before suggesting an accept/cancel action. ' +
        'Requires an XRPL r... address.',
      inputSchema: {
        address: z
          .string()
          .describe('XRPL r... address of the wallet to query (e.g. "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe").'),
      },
    },
    async ({ address }) => {
      try {
        if (!isValidClassicAddress(address)) {
          throw new McpToolError(
            'INVALID_INPUT',
            `"${address}" is not a valid XRPL classic address. Expected an r... address.`,
          );
        }

        const [incomingRaw, outgoingRaw] = await Promise.all([
          deps.api.getOffersByDestination(address),
          deps.api.getOffersByOwner(address),
        ]);

        const payload = buildPendingPayload(
          address,
          incomingRaw,
          outgoingRaw,
          myDomainsUrl({ webBase: deps.config.webBase }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
