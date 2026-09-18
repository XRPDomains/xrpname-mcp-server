/**
 * x402 Gateway for XRPL — Phase 1 (pay-only, multi-tenant, non-custodial).
 *
 * GET|POST /mcp/x402/pay/:projectId
 *   - no PAYMENT-SIGNATURE  → 402 with the project's payTo + price (free quote).
 *   - with PAYMENT-SIGNATURE → facilitator verify+settle (payer → project.payTo)
 *                              → 200 receipt.
 *
 * The gateway holds no funds and no keys: the payer signs, the T54 facilitator
 * settles straight to the project's wallet. Price + recipient come from the
 * project registry, never from the payer.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  buildChallenge,
  caip2,
  decodeHeader,
  encodeHeader,
  makeInvoiceId,
  settleWithFacilitator,
  type PaymentSignature,
} from '../lib/x402.js';
import { loadGatewayRegistry } from '../lib/gateway-registry.js';
import type { Deps } from '../types/deps.js';
import type { Analytics } from '../lib/analytics.js';

export function registerGatewayRoutes(app: FastifyInstance, deps: Deps, analytics?: Analytics): void {
  const { gateway, x402, registration, webBase } = deps.config;
  if (!gateway.enabled) return;

  const registry = loadGatewayRegistry(gateway.projectsFile);
  const network = registration.network;

  // Mounted under /mcp so the existing `^mcp` IIS reverse-proxy rule routes it
  // (paths outside /mcp fall through to the website SPA). GET + POST: a bare
  // GET returns the 402 quote so directory crawlers (xrpl-ai.org) can verify it.
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const projectId = (req.params as { projectId?: string }).projectId ?? '';
    const project = registry.get(projectId);
    if (!project || !project.active) {
      return reply.code(404).send({ error: 'PROJECT_NOT_FOUND', projectId });
    }
    // Phase 1: XRP only.
    if (project.asset.code !== 'XRP') {
      return reply.code(400).send({ error: 'ASSET_NOT_SUPPORTED', message: 'Phase 1 supports XRP only.' });
    }

    // Resolve the amount from the project's price config (payer cannot lower it).
    let amountXrp: number;
    if (project.price.mode === 'fixed') {
      amountXrp = project.price.amount;
    } else {
      const body = req.body as { amount?: unknown } | undefined;
      const query = req.query as { amount?: unknown } | undefined;
      const requested = Number(body?.amount ?? query?.amount);
      if (Number.isFinite(requested)) {
        if (requested < project.price.min || requested > project.price.max) {
          return reply.code(400).send({ error: 'AMOUNT_OUT_OF_RANGE', min: project.price.min, max: project.price.max });
        }
        amountXrp = requested;
      } else {
        // Bare quote (e.g. a crawler GET with no amount) → quote at the floor.
        amountXrp = project.price.min;
      }
    }
    const amountDrops = String(Math.round(amountXrp * 1_000_000));
    const sourceTag = project.sourceTag ?? x402.sourceTag;

    // Step 1 — no signature → 402 quote (no charge).
    const sigHeader = req.headers['payment-signature'];
    if (!sigHeader) {
      const invoiceId = makeInvoiceId(`${projectId}:pay`, randomUUID());
      const challenge = buildChallenge({
        network,
        payTo: project.payTo,
        amountDrops,
        invoiceId,
        sourceTag,
        resourceUrl: webBase + '/mcp/x402/pay/' + projectId,
        description: `${project.name} payment (${amountXrp} XRP)`,
      });
      reply.header('PAYMENT-REQUIRED', encodeHeader(challenge));
      // Body mirrors the PAYMENT-REQUIRED header (full x402 v2 PaymentRequired,
      // incl. the `resource` object) plus convenience fields.
      return reply.code(402).send({ ...challenge, projectId, price_xrp: amountXrp });
    }

    // Step 2 — settle via facilitator against the SERVER's authoritative terms.
    const sig = decodeHeader<PaymentSignature>(Array.isArray(sigHeader) ? sigHeader[0] : sigHeader);
    if (!sig?.payload?.signedTxBlob) return reply.code(400).send({ error: 'BAD_SIGNATURE' });
    const clientInvoiceId = String((sig.accepted?.extra as { invoiceId?: unknown } | undefined)?.invoiceId ?? '');
    const [requirement] = buildChallenge({ network, payTo: project.payTo, amountDrops, invoiceId: clientInvoiceId, sourceTag }).accepts;
    if (!requirement) return reply.code(500).send({ error: 'REQUIREMENT_BUILD_FAILED' });

    const settle = await settleWithFacilitator(x402.facilitatorUrl, sig, requirement);
    if (!settle.success || !settle.transaction || !settle.payer) {
      analytics?.recordX402Refusal({ kind: 'pay', item: projectId, reason: settle.error || 'PAYMENT_FAILED', amountXrp: amountXrp });
      return reply.code(402).send({ error: 'PAYMENT_FAILED', detail: settle.error });
    }

    // Record x402 on-chain activity for the public dashboard.
    analytics?.recordX402({ kind: 'pay', item: projectId, amountXrp: amountXrp, payer: settle.payer, tx: settle.transaction, payTo: project.payTo });

    reply.header(
      'PAYMENT-RESPONSE',
      encodeHeader({ success: true, transaction: settle.transaction, network: caip2(network), payer: settle.payer }),
    );
    return reply.code(200).send({
      paid: true,
      projectId,
      amount_xrp: amountXrp,
      payment_tx: settle.transaction,
      payer: settle.payer,
      success_url: project.successUrl ?? null,
    });
  };

  app.get('/mcp/x402/pay/:projectId', handler);
  app.post('/mcp/x402/pay/:projectId', handler);
}
