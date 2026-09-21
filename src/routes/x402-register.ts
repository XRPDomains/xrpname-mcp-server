/**
 * POST /mcp/x402/register — x402 mint gateway (XRP, mainnet).
 *
 * Issuer-agnostic core: 402 challenge → facilitator verify+settle → mint →
 * AcceptOffer template → response. All item-specific logic (validation, pricing,
 * the mint call, admin ping, accept template) lives behind a MintAdapter.
 * XRPDomains is the first adapter (see src/adapters/xrpdomains-adapter.ts);
 * adding an issuer = another adapter, no edits here.
 *
 * EXPERIMENTAL / money path. Gated behind config.x402.enabled. No private keys
 * are ever held here: the agent signs the Payment; the agent signs the
 * AcceptOffer. The gateway only orchestrates + delegates to the adapter.
 *
 * Flow:
 *   1. no PAYMENT-SIGNATURE  → 402 with PAYMENT-REQUIRED (price + invoiceId).
 *   2. with PAYMENT-SIGNATURE → facilitator verify+settle → re-check availability
 *      → adapter.fulfil (mint) → return offer_id + AcceptOffer template.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { priceXrp } from '../lib/pricing.js';
import { priceRlusd } from '../lib/pricing-source.js';
import { createXrpDomainsAdapter } from '../adapters/xrpdomains-adapter.js';
import type { MintAdapter } from '../lib/mint-adapter.js';
import type { RlusdPaymentInfo } from '../lib/create-order.js';
import {
  buildChallenge,
  buildRequirement,
  caip2,
  decodeHeader,
  encodeHeader,
  makeInvoiceId,
  settleWithFacilitator,
  type PaymentRequirement,
  type PaymentSignature,
} from '../lib/x402.js';
import type { Deps } from '../types/deps.js';
import type { Analytics } from '../lib/analytics.js';

/** x402 max-timeout for a register quote (seconds) — also the RLUSD lock TTL. */
const X402_MAX_TIMEOUT = 600;

/** Server-locked RLUSD quote, cached by invoiceId so settle uses OUR figure
 *  (rate + amount), never the client-echoed one (which could underpay). */
interface RlusdLock {
  rlusdAmount: string; // decimal string, 2dp
  lockedRate: number; // XRP/USD at 402 time
  lockedAt: number; // unix seconds
  lockedSource: string;
}

export function registerX402Route(app: FastifyInstance, deps: Deps, analytics?: Analytics): void {
  const { x402, rlusd, registration, webBase, basePriceXrp, discountPercent } = deps.config;
  const resourceUrl = webBase + '/mcp/x402/register';

  // Build the RLUSD payment option for a given net XRP price and lock the quote
  // (amount + rate) in the cache keyed by invoiceId. The lock is what settle
  // trusts — never the client-echoed amount — so a client can't underpay by
  // sending a stale/low RLUSD figure. Returns null when RLUSD is off or no live
  // XRP/USD rate is available (XRP-only 402 in that case).
  async function rlusdAccept(netXrp: number, invoiceId: string): Promise<PaymentRequirement | null> {
    if (!rlusd.enabled) return null;
    const table = await deps.api.getPricing().catch(() => null);
    if (!table) return null;
    const rate = await deps.api.getXrpUsdRate(table).catch(() => null);
    if (!rate) return null;
    const amountStr = priceRlusd(netXrp, rate).toFixed(2);
    const lock: RlusdLock = {
      rlusdAmount: amountStr,
      lockedRate: rate,
      lockedAt: Math.floor(Date.now() / 1000),
      lockedSource: 'mcp',
    };
    await deps.cache.set(`x402q:${invoiceId}`, lock, X402_MAX_TIMEOUT);
    return buildRequirement(
      registration.network,
      registration.contractAddress,
      { asset: rlusd.currencyCode, amount: amountStr, issuer: rlusd.issuer },
      invoiceId,
      x402.sourceTag,
      X402_MAX_TIMEOUT,
    );
  }

  // GET → a representative 402 quote so directory crawlers (xrpl-ai.org) can
  // discover + verify this resource without a domain body. Real registration is
  // POST { domain } below (per-domain price). This quote is not completable via GET.
  app.get('/mcp/x402/register', async (_req, reply) => {
    if (!x402.enabled) return reply.code(404).send({ error: 'NOT_ENABLED' });
    const sampleXrp = x402.testPriceXrp > 0 ? x402.testPriceXrp : priceXrp(5, false, { basePriceXrp, discountPercent });
    const amountDrops = String(Math.round(sampleXrp * 1_000_000));
    const invoiceId = makeInvoiceId('sample', randomUUID());
    const rl = await rlusdAccept(sampleXrp, invoiceId);
    const challenge = buildChallenge({
      network: registration.network,
      payTo: registration.contractAddress,
      amountDrops,
      invoiceId,
      sourceTag: x402.sourceTag,
      resourceUrl,
      description: 'Register an XRPName domain (.xrp/.xrpl/.xrpfi/.rlusd) via x402. Pay in XRP or RLUSD. POST { domain } for the exact per-domain price; this is a representative quote.',
      extraAccepts: rl ? [rl] : undefined,
    });
    reply.header('PAYMENT-REQUIRED', encodeHeader(challenge));
    return reply.code(402).send({ ...challenge, note: 'POST { domain } to register a specific domain at its exact price.' });
  });

  // First (and currently only) adapter. To support another issuer later, select
  // an adapter here (e.g. by a `kind` field on the request) — the rest is generic.
  const adapter: MintAdapter = createXrpDomainsAdapter(deps);

  // Mounted under /mcp so the existing `^mcp` IIS reverse-proxy rule routes it —
  // no new web.config rule needed.
  app.post('/mcp/x402/register', async (req, reply) => {
    if (!x402.enabled) return reply.code(404).send({ error: 'NOT_ENABLED' });

    // Coarse geo + raw IP for the audit trail (country is public; IP is only
    // exposed in the token-gated detail view). Same CF/XFF order as index.ts.
    const cfCountry = typeof req.headers['cf-ipcountry'] === 'string' ? (req.headers['cf-ipcountry'] as string) : null;
    const cfIp = typeof req.headers['cf-connecting-ip'] === 'string'
      ? (req.headers['cf-connecting-ip'] as string)
      : typeof req.headers['x-forwarded-for'] === 'string'
        ? ((req.headers['x-forwarded-for'] as string).split(',')[0] ?? '').trim() || req.ip
        : req.ip;

    // `domain` kept as the request field for the domain adapter (back-compat with
    // the buy client + external agents). A generic gateway could accept `item`.
    const raw = (req.body as { domain?: unknown } | undefined)?.domain;
    const norm = adapter.normalizeItem(typeof raw === 'string' ? raw : '');
    if (!norm.ok) return reply.code(400).send({ error: 'INVALID_INPUT', message: norm.reason });
    const item = norm.item;

    // Availability + price (fresh)
    const q = await adapter.quote(item);
    if (!q.available) return reply.code(409).send({ error: 'DOMAIN_TAKEN', domain: item });

    // TEST override: X402_TEST_PRICE_XRP forces a fixed low price for a cheap live
    // run — the backend must agree on the amount too (see route docstring).
    let net = q.priceXrp;
    let gross = q.grossXrp;
    if (x402.testPriceXrp > 0) {
      net = x402.testPriceXrp;
      gross = x402.testPriceXrp;
    }
    const amountDrops = String(Math.round(net * 1_000_000));

    // Step 1 — no signature yet → 402 challenge
    const sigHeader = req.headers['payment-signature'];
    if (!sigHeader) {
      const invoiceId = makeInvoiceId(item, randomUUID());
      const rl = await rlusdAccept(net, invoiceId);
      const challenge = buildChallenge({
        network: registration.network,
        payTo: registration.contractAddress,
        amountDrops,
        invoiceId,
        sourceTag: x402.sourceTag,
        resourceUrl,
        description: `${adapter.label} ${item} (${net} XRP)`,
        extraAccepts: rl ? [rl] : undefined,
      });
      reply.header('PAYMENT-REQUIRED', encodeHeader(challenge));
      // Body mirrors the PAYMENT-REQUIRED header (full x402 v2 PaymentRequired,
      // incl. the `resource` object) plus convenience fields.
      return reply.code(402).send({
        ...challenge,
        domain: item,
        price_xrp: net,
        ...(rl ? { price_rlusd: Number(rl.amount) } : {}),
      });
    }

    // Step 2 — settle via facilitator
    const sig = decodeHeader<PaymentSignature>(Array.isArray(sigHeader) ? sigHeader[0] : sigHeader);
    if (!sig?.payload?.signedTxBlob) return reply.code(400).send({ error: 'BAD_SIGNATURE' });

    // Rebuild the SERVER's authoritative requirement (payTo/amount/sourceTag are
    // ours; invoiceId comes from the client so the on-chain binding matches).
    // Asset-aware: if the client chose RLUSD (accepted.asset !== "XRP"), trust the
    // cached lock (server-generated amount + rate), not the client-echoed amount.
    const clientInvoiceId = String((sig.accepted?.extra as { invoiceId?: unknown } | undefined)?.invoiceId ?? '');
    const chosenAsset = String(sig.accepted?.asset ?? 'XRP');
    const payWithRlusd = chosenAsset !== 'XRP';

    let requirement: PaymentRequirement | undefined;
    let rlusdInfo: RlusdPaymentInfo | undefined;
    if (payWithRlusd) {
      if (!rlusd.enabled || chosenAsset !== rlusd.currencyCode) {
        return reply.code(400).send({ error: 'UNSUPPORTED_ASSET', asset: chosenAsset });
      }
      const lock = await deps.cache.get<RlusdLock>(`x402q:${clientInvoiceId}`);
      if (!lock) {
        analytics?.recordX402Refusal({ kind: 'register', item, reason: 'QUOTE_EXPIRED', amountXrp: net, country: cfCountry, ip: cfIp });
        return reply.code(402).send({ error: 'QUOTE_EXPIRED', detail: 'RLUSD quote lock expired — request a fresh 402.' });
      }
      requirement = buildRequirement(
        registration.network,
        registration.contractAddress,
        { asset: rlusd.currencyCode, amount: lock.rlusdAmount, issuer: rlusd.issuer },
        clientInvoiceId,
        x402.sourceTag,
        X402_MAX_TIMEOUT,
      );
      rlusdInfo = {
        lockedRate: lock.lockedRate,
        lockedAt: lock.lockedAt,
        lockedSource: lock.lockedSource,
        rlusdAmount: lock.rlusdAmount,
        rlusdIssuer: rlusd.issuer,
        rlusdCurrencyCode: rlusd.currencyCode,
      };
    } else {
      [requirement] = buildChallenge({
        network: registration.network,
        payTo: registration.contractAddress,
        amountDrops,
        invoiceId: clientInvoiceId,
        sourceTag: x402.sourceTag,
      }).accepts;
    }
    if (!requirement) return reply.code(500).send({ error: 'REQUIREMENT_BUILD_FAILED' });

    const settle = await settleWithFacilitator(x402.facilitatorUrl, sig, requirement);
    if (!settle.success || !settle.transaction || !settle.payer) {
      analytics?.recordX402Refusal({ kind: 'register', item, reason: settle.error || 'PAYMENT_FAILED', amountXrp: net, country: cfCountry, ip: cfIp });
      return reply.code(402).send({ error: 'PAYMENT_FAILED', detail: settle.error });
    }
    const payer = settle.payer;
    const paymentTx = settle.transaction;

    // Race re-check: taken after payment → surface for refund
    const q2 = await adapter.quote(item);
    if (!q2.available) {
      analytics?.recordX402Refusal({ kind: 'register', item, reason: 'DOMAIN_TAKEN_AFTER_PAYMENT', payer, amountXrp: net, country: cfCountry, ip: cfIp });
      return reply.code(409).send({ error: 'DOMAIN_TAKEN_AFTER_PAYMENT', domain: item, payment_tx: paymentTx });
    }

    // Fulfil via the adapter (v3 createOrder for XRPDomains). If it times out or
    // errors but the mint may have completed backend-side, recover the offer so
    // the paid agent can still take custody (else the payment is stranded).
    let mint: Awaited<ReturnType<typeof adapter.fulfil>>;
    try {
      mint = await adapter.fulfil({
        item,
        payer,
        paymentTx,
        priceXrp: net,
        grossXrp: gross,
        currency: payWithRlusd ? 'RLUSD' : 'XRP',
        rlusd: rlusdInfo,
      });
    } catch (err) {
      mint = { ok: false, nftokenId: null, offerId: null, mintTx: null, raw: String((err as Error).message) };
    }
    if ((!mint.ok || !mint.offerId) && adapter.recover) {
      const recovered = await adapter.recover({ item, payer }).catch(() => null);
      if (recovered?.ok && recovered.offerId) mint = recovered;
    }
    if (!mint.ok || !mint.offerId) {
      analytics?.recordX402Refusal({ kind: 'register', item, reason: 'MINT_FAILED', payer, amountXrp: net, country: cfCountry, ip: cfIp });
      return reply.code(502).send({ error: 'MINT_FAILED', domain: item, payment_tx: paymentTx });
    }

    // Post-mint admin notification (Telegram), fire-and-forget.
    adapter.onMinted?.({ item, payer, priceXrp: net, mintTx: mint.mintTx });

    // Record x402 on-chain activity for the public dashboard.
    analytics?.recordX402({
      kind: 'register',
      item,
      amountXrp: net,
      payer,
      tx: paymentTx,
      mintTx: mint.mintTx,
      payTo: registration.contractAddress,
      country: cfCountry,
      ip: cfIp,
      currency: payWithRlusd ? 'RLUSD' : 'XRP',
      amountPaid: payWithRlusd && rlusdInfo ? Number(rlusdInfo.rlusdAmount) : net,
    });

    reply.header(
      'PAYMENT-RESPONSE',
      encodeHeader({ success: true, transaction: paymentTx, network: caip2(registration.network), payer }),
    );
    return reply.code(200).send({
      minted: true,
      domain: item,
      owner: payer,
      paid_currency: payWithRlusd ? 'RLUSD' : 'XRP',
      ...(payWithRlusd && rlusdInfo ? { paid_rlusd: rlusdInfo.rlusdAmount, locked_rate: rlusdInfo.lockedRate } : {}),
      nftoken_id: mint.nftokenId,
      offer_id: mint.offerId,
      mint_tx: mint.mintTx,
      payment_tx: paymentTx,
      // Agent signs this to take custody (decision §1).
      accept_offer_template: adapter.acceptTemplate(payer, mint.offerId, item),
    });
  });
}
