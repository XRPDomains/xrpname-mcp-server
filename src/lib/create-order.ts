/**
 * create-order.ts — build the `POST /api/xrplnft/createOrder` request body for
 * the x402 registration flow. Pure + testable; mirrors the contract documented
 * in docs/createOrder-x402-handoff.md (§2 XRP, §7 RLUSD).
 *
 * The MCP server calls createOrder AFTER it has verified the buyer's Payment on
 * XRPL — same body the v3 web app sends, with adapter="x402".
 */

export interface RlusdPaymentInfo {
  lockedRate: number; // XRP/USD locked at Payment time
  lockedAt: number; // unix seconds
  lockedSource: string; // coingecko | bitstamp | bitfinex | cached
  rlusdAmount: string; // decimal string, matches Payment Amount.value
  rlusdIssuer: string; // pricing.json currencies.RLUSD.issuer
  rlusdCurrencyCode: string; // pricing.json currencies.RLUSD.currency_code
}

export interface CreateOrderInput {
  /** Full domain WITH tld, lowercase, e.g. "alice.xrp". */
  domain: string;
  /** 64-char tx hash of the validated Payment. */
  paymentTx: string;
  /** Buyer (payer) XRPL classic address. */
  buyer: string;
  /** Address that receives the NFT sell offer (defaults to buyer). */
  owner?: string;
  /** Platform contract wallet — mints from here AND is the Payment destination. */
  contractAddress: string;
  /** NFT metadata endpoint prefix, e.g. ".../api/nftdomains/metadata/". */
  baseUri: string;
  /** "MAINNET" | "TESTNET". */
  network: 'MAINNET' | 'TESTNET';
  /** Final amount paid (post-discount), human units (XRP or RLUSD). */
  amount: number;
  /** Pre-discount base tier price for (domain, tld). */
  price: number;
  /** "XRP" | "RLUSD". */
  currency: 'XRP' | 'RLUSD';
  /** Client session UUID (Pusher channel key). */
  uuid: string;
  /** Referral code, or '' if none. */
  refcode?: string;
  /** Required when currency === 'RLUSD'. */
  rlusd?: RlusdPaymentInfo;
}

/** Assemble the flat JSON body createOrder expects. */
export function buildCreateOrderPayload(input: CreateOrderInput): Record<string, unknown> {
  const url = `${input.baseUri}${input.domain}`;
  const owner = input.owner ?? input.buyer;

  const body: Record<string, unknown> = {
    domain: input.domain,
    payment_tx: input.paymentTx,
    buyer: input.buyer,
    owner,
    issuer: input.contractAddress,
    receiver: input.contractAddress,
    amount: input.amount,
    price: input.price,
    base_uri: input.baseUri,
    network: input.network,
    uri: '',
    url,
    uuid: input.uuid,
    payload_uuid: input.uuid,
    ismobile: false,
    nftoken_id: '',
    adapter: 'x402',
    extension: true,
    refcode: input.refcode ?? '',
    setPrimary: false,
    isVerify: true,
    payment_currency: input.currency,
  };

  if (input.currency === 'RLUSD') {
    if (!input.rlusd) throw new Error('createOrder: RLUSD payment requires rlusd payment info');
    body.locked_rate = input.rlusd.lockedRate;
    body.locked_at = input.rlusd.lockedAt;
    body.locked_source = input.rlusd.lockedSource;
    body.rlusd_amount = input.rlusd.rlusdAmount;
    body.rlusd_issuer = input.rlusd.rlusdIssuer;
    body.rlusd_currency_code = input.rlusd.rlusdCurrencyCode;
  }

  return body;
}

export interface CreateOrderResult {
  ok: boolean;
  domain: string | null;
  owner: string | null;
  nftokenId: string | null;
  offerId: string | null;
  mintTx: string | null;
  createOfferTx: string | null;
  raw: unknown;
}

/** Normalise the createOrder response (§3). Success = status && data.isOK && offer_id. */
export function parseCreateOrderResponse(json: unknown): CreateOrderResult {
  const j = (json ?? {}) as { status?: unknown; data?: Record<string, unknown> };
  const d = (j.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  const offerId = str(d.offer_id);
  return {
    ok: j.status === true && d.isOK === true && offerId !== null,
    domain: str(d.domain),
    owner: str(d.owner),
    nftokenId: str(d.nftoken_id),
    offerId,
    mintTx: str(d.mint_tx),
    createOfferTx: str(d.create_offer_tx),
    raw: json,
  };
}

/**
 * Ready-to-sign NFTokenAcceptOffer template for the buyer to take custody
 * (decision §1: the payer may accept). The agent signs + submits this itself.
 */
export function buildAcceptOfferTemplate(buyer: string, offerId: string, domain: string): Record<string, unknown> {
  return {
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyer,
    NFTokenSellOffer: offerId,
    Memos: [{ Memo: { MemoData: Buffer.from(domain, 'utf8').toString('hex').toUpperCase() } }],
  };
}
