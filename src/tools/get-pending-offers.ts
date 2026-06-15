/**
 * get_pending_offers — READ. §8.2 (v2). Pending domain operations for a wallet:
 *   - mint     : paid-but-not-yet-minted orders (continue-mint candidates)
 *   - incoming : someone offered the wallet a domain
 *   - outgoing : the wallet listed a domain for transfer
 *
 * Identity (Phase 1): `address` is REQUIRED. OAuth (Phase 3) will default it.
 *
 * Backend (post Jun 12 consolidation): ONE call —
 *   GET /api/xrplnft/getPendingDomains?owner=<r…>  (E25)
 *   → { data: { mint[], incoming[], outgoing[], counts } } — atomic snapshot,
 *   replacing the legacy getOfferByDestination + getOfferByOwner pair.
 *
 * Field mapping BE → tool: incoming[].owner → `sender`; *[].amount → `amount_drops`
 * (kept as string for precision); outgoing[].destination → `destination`.
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
  /** Counterparty: sender (incoming) or destination (outgoing). */
  counterparty: string | null;
  amount_drops: string | null;
  expiration: number | null;
  created_at: string | null;
  raw: Record<string, unknown>;
}

export interface PendingMint {
  domain: string | null;
  nftoken_id: string | null;
  payment_tx: string | null;
  status: string | null;
  created_at: string | null;
  raw: Record<string, unknown>;
}

const DOMAIN_KEYS = ['domain', 'name', 'Domain', 'Name'];
const NFT_ID_KEYS = ['nftoken_id', 'nftokenId', 'NFTokenID', 'nftid'];
const OFFER_ID_KEYS = ['offer_id', 'offerId', 'nft_offer_index', 'NFTokenOfferID', 'index'];
const AMOUNT_KEYS = ['amount_drops', 'amount', 'Amount'];
const EXPIRATION_KEYS = ['expiration', 'Expiration', 'expires_at'];
const CREATED_KEYS = ['created_at', 'createdAt', 'create_at', 'createtime'];
const PAYMENT_TX_KEYS = ['payment_tx', 'paymentTx', 'tx_hash', 'hash'];
const STATUS_KEYS = ['status', 'state'];
// Incoming: the offer's NFT owner IS the sender. Outgoing: the destination.
const SENDER_KEYS = ['sender', 'owner', 'Owner', 'account', 'Account', 'from'];
const DESTINATION_KEYS = ['destination', 'Destination', 'to'];

/** Map one raw offer (incoming|outgoing) to the stable shape. Exported for tests. */
export function mapOffer(raw: unknown, counterpartyKeys: string[]): PendingOffer {
  const o = obj(raw);
  return {
    domain: pickStr(o, DOMAIN_KEYS),
    nftoken_id: pickStr(o, NFT_ID_KEYS),
    offer_id: pickStr(o, OFFER_ID_KEYS),
    counterparty: pickStr(o, counterpartyKeys),
    amount_drops: pickStr(o, AMOUNT_KEYS),
    expiration: pickNum(o, EXPIRATION_KEYS),
    created_at: pickStr(o, CREATED_KEYS),
    raw: o,
  };
}

/** Map one raw paid-but-unminted order. Exported for tests. */
export function mapMint(raw: unknown): PendingMint {
  const o = obj(raw);
  return {
    domain: pickStr(o, DOMAIN_KEYS),
    nftoken_id: pickStr(o, NFT_ID_KEYS),
    payment_tx: pickStr(o, PAYMENT_TX_KEYS),
    status: pickStr(o, STATUS_KEYS),
    created_at: pickStr(o, CREATED_KEYS),
    raw: o,
  };
}

/** Build the full tool payload from the three raw lists. Exported for tests. */
export function buildPendingPayload(
  address: string,
  mintRaw: unknown[],
  incomingRaw: unknown[],
  outgoingRaw: unknown[],
  manageUrl: string,
): {
  address: string;
  mint: PendingMint[];
  incoming: PendingOffer[];
  outgoing: PendingOffer[];
  counts: { mint: number; incoming: number; outgoing: number; total: number };
  manage_url: string;
} {
  const mint = mintRaw.map(mapMint);
  const incoming = incomingRaw.map((r) => mapOffer(r, SENDER_KEYS));
  const outgoing = outgoingRaw.map((r) => mapOffer(r, DESTINATION_KEYS));
  return {
    address,
    mint,
    incoming,
    outgoing,
    counts: {
      mint: mint.length,
      incoming: incoming.length,
      outgoing: outgoing.length,
      total: mint.length + incoming.length + outgoing.length,
    },
    manage_url: manageUrl,
  };
}

export function registerGetPendingOffers(server: McpServer, deps: Deps): void {
  server.registerTool(
    'get_pending_offers',
    {
      description:
        'Get all pending XRPL domain operations for a wallet — incoming offers (someone offered the ' +
        'wallet a domain), outgoing offers (the wallet listed a domain), and paid-but-not-yet-minted ' +
        'orders the user can still complete. ' +
        'Use when the user asks "do I have any pending transfers?", "what offers are waiting on me?", ' +
        'or before suggesting an accept/cancel/continue-mint action. Requires an XRPL r... address.',
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

        const pending = await deps.api.getPendingDomains(address);
        const payload = buildPendingPayload(
          address,
          pending.mint,
          pending.incoming,
          pending.outgoing,
          myDomainsUrl({ webBase: deps.config.webBase }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}

function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
