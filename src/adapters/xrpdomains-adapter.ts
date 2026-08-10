/**
 * xrpdomains-adapter.ts — the FIRST MintAdapter for the x402 mint gateway.
 *
 * Holds everything domain-specific: validating a root domain, pricing from
 * pricing.json (with local mirror fallback), the v3 `createOrder` call, the
 * Telegram admin ping, and the NFTokenAcceptOffer template. The gateway route
 * stays issuer-agnostic; a second issuer = a second adapter, no route changes.
 */
import { randomUUID } from 'node:crypto';
import { parseDomain } from '../lib/domain-validator.js';
import { priceXrp } from '../lib/pricing.js';
import { priceBreakdownXrp } from '../lib/pricing-source.js';
import { buildCreateOrderPayload, buildAcceptOfferTemplate } from '../lib/create-order.js';
import type { MintAdapter, MintQuote, MintResult, FulfilInput, NormalizeResult } from '../lib/mint-adapter.js';
import type { Deps } from '../types/deps.js';

export function createXrpDomainsAdapter(deps: Deps): MintAdapter {
  const { registration, basePriceXrp, discountPercent } = deps.config;

  return {
    id: 'xrpdomains',
    label: 'XRPName domain',

    normalizeItem(input: string): NormalizeResult {
      const parsed = parseDomain(typeof input === 'string' ? input : '');
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      // x402 registration is ROOT domains only — subnames are minted by the
      // parent owner through a different path.
      if (parsed.isSubname) return { ok: false, reason: 'Only root domains can be registered via x402.' };
      return { ok: true, item: parsed.domain };
    },

    async quote(item: string): Promise<MintQuote> {
      const parsed = parseDomain(item);
      const [chk] = await deps.api.checkDomains([item]);
      const available = chk ? chk.status === 'available' : true;

      let gross = 0;
      let net = 0;
      if (parsed.ok) {
        const table = await deps.api.getPricing().catch(() => null);
        const bd = table
          ? priceBreakdownXrp(table, parsed.tld, parsed.length, parsed.isSubname)
          : { gross: null, net: null };
        net = bd.net ?? priceXrp(parsed.length, parsed.isSubname, { basePriceXrp, discountPercent });
        gross = bd.gross ?? net;
      }
      return { available, priceXrp: net, grossXrp: gross };
    },

    async fulfil({ item, payer, paymentTx, priceXrp: net, grossXrp }: FulfilInput): Promise<MintResult> {
      const order = await deps.api.createOrder(
        buildCreateOrderPayload({
          domain: item,
          paymentTx,
          buyer: payer,
          contractAddress: registration.contractAddress,
          baseUri: registration.nftBaseUri,
          network: registration.network,
          amount: net,
          price: grossXrp,
          currency: 'XRP',
          uuid: randomUUID(),
        }),
      );
      return {
        ok: order.ok,
        nftokenId: order.nftokenId,
        offerId: order.offerId,
        mintTx: order.mintTx,
        raw: order.raw,
      };
    },

    async recover({ item, payer }): Promise<MintResult | null> {
      // The mint may have finished on the backend even if createOrder timed out.
      // Find the pending sell offer created FOR the payer for this exact domain.
      const pending = await deps.api.getPendingDomains(payer).catch(() => null);
      if (!pending) return null;
      const match = pending.incoming.find((raw) => {
        const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        return (
          String(e.domain ?? '').toLowerCase() === item.toLowerCase() &&
          String(e.destination ?? '') === payer &&
          Boolean(e.offer_id)
        );
      }) as Record<string, unknown> | undefined;
      if (!match) return null;
      return {
        ok: true,
        offerId: String(match.offer_id),
        nftokenId: match.nftoken_id ? String(match.nftoken_id) : null,
        mintTx: null,
        raw: match,
      };
    },

    onMinted({ item, priceXrp: net, mintTx }) {
      // §10 handoff — fire-and-forget Telegram admin ping. Only after a real mint.
      if (mintTx) deps.api.notifyRegistration(item, `${net} $XRP`, 'x402');
    },

    acceptTemplate(payer: string, offerId: string, item: string): Record<string, unknown> {
      return buildAcceptOfferTemplate(payer, offerId, item);
    },
  };
}
