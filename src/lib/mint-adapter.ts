/**
 * mint-adapter.ts — the issuer-agnostic contract behind the x402 mint gateway.
 *
 * The gateway route (/mcp/x402/register) owns the generic x402 flow (402 →
 * facilitator verify/settle → mint → accept template → response). Everything
 * issuer-specific — validating the item, pricing, the mint call, the accept
 * template, post-mint hooks — lives behind a MintAdapter. XRPDomains is the
 * first adapter; adding another issuer = writing another adapter, no route edits.
 */

export interface MintQuote {
  available: boolean;
  /** Final amount to pay (post-discount), XRP. */
  priceXrp: number;
  /** Pre-discount base price, XRP (for backends that sanity-check the tier). */
  grossXrp: number;
}

export interface MintResult {
  ok: boolean;
  nftokenId: string | null;
  offerId: string | null;
  mintTx: string | null;
  raw: unknown;
}

export type NormalizeResult = { ok: true; item: string } | { ok: false; reason: string };

export interface FulfilInput {
  item: string;
  payer: string;
  paymentTx: string;
  priceXrp: number;
  grossXrp: number;
}

export interface MintAdapter {
  /** Stable id, e.g. "xrpdomains". Used in invoice resource + logs. */
  readonly id: string;
  /** Human label, e.g. "XRPName domain". */
  readonly label: string;
  /** Validate + canonicalise the requested item (e.g. a domain). */
  normalizeItem(input: string): NormalizeResult;
  /** Availability + price for the item. */
  quote(item: string): Promise<MintQuote>;
  /** After payment settled on XRPL: mint + create the sell offer. */
  fulfil(input: FulfilInput): Promise<MintResult>;
  /**
   * Optional recovery: when fulfil times out / errors but the mint may have
   * completed on the backend anyway, look up the already-created sell offer so
   * the agent can still take custody. Returns null if nothing pending is found.
   */
  recover?(input: { item: string; payer: string }): Promise<MintResult | null>;
  /** Optional fire-and-forget hook after a successful mint (e.g. admin ping). */
  onMinted?(input: { item: string; payer: string; priceXrp: number; mintTx: string | null }): void;
  /** The NFTokenAcceptOffer template the buyer signs to take custody. */
  acceptTemplate(payer: string, offerId: string, item: string): Record<string, unknown>;
}
