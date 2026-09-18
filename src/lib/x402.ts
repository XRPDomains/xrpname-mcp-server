/**
 * x402.ts — protocol glue for the T54 XRPL x402 "exact" scheme (v2).
 *
 * Deterministic, dependency-free helpers so the /x402/register route can:
 *  - build the `PAYMENT-REQUIRED` challenge (402) with per-domain price,
 *  - decode the client's `PAYMENT-SIGNATURE`,
 *  - encode the `PAYMENT-RESPONSE`,
 *  - call the facilitator's /verify + /settle.
 *
 * Spec: https://xrpl-x402.t54.ai/docs/xrpl-scheme
 * Headers (v2): PAYMENT-REQUIRED (server→client), PAYMENT-SIGNATURE (client→server),
 * PAYMENT-RESPONSE (server→client) — all base64-encoded JSON.
 */

export const X402_VERSION = 2;
export const DEFAULT_SOURCE_TAG = 804681468;

/** CAIP-2 network id for XRPL. */
export function caip2(network: 'MAINNET' | 'TESTNET'): string {
  return network === 'MAINNET' ? 'xrpl:0' : 'xrpl:1';
}

export interface PaymentRequirement {
  scheme: 'exact';
  network: string; // xrpl:0 | xrpl:1
  asset: string; // "XRP" or canonical 40-hex currency code (RLUSD)
  payTo: string;
  amount: string; // drops (XRP) or decimal string (IOU)
  maxTimeoutSeconds: number;
  extra: { invoiceId: string; sourceTag: number; issuer?: string };
}

/** x402 v2 resource descriptor. MUST be an object (not a string) so SDK clients
 *  (x402-xrpl) parse the 402 body correctly. */
export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface Challenge {
  x402Version: number;
  resource?: ResourceInfo;
  accepts: PaymentRequirement[];
}

/** Invoice id bound to a specific domain + unique nonce (replay protection). */
export function makeInvoiceId(domain: string, nonce: string): string {
  return `XRPNAME-${domain}-${nonce}`;
}

/** Base64(JSON) — the wire encoding for all three x402 headers. */
export function encodeHeader(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

/** Decode a base64(JSON) x402 header value. Returns null on malformed input. */
export function decodeHeader<T = unknown>(value: string | undefined | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export interface BuildChallengeInput {
  network: 'MAINNET' | 'TESTNET';
  payTo: string;
  amountDrops: string; // XRP drops as string
  invoiceId: string;
  sourceTag?: number;
  /** Absolute URL of the paid resource — becomes resource.url (x402 v2). */
  resourceUrl?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

/** Build the PAYMENT-REQUIRED challenge for an XRP payment (XRP-first PoC). */
export function buildChallenge(input: BuildChallengeInput): Challenge {
  return {
    x402Version: X402_VERSION,
    resource: input.resourceUrl
      ? { url: input.resourceUrl, description: input.description, mimeType: input.mimeType ?? 'application/json' }
      : undefined,
    accepts: [
      {
        scheme: 'exact',
        network: caip2(input.network),
        asset: 'XRP',
        payTo: input.payTo,
        amount: input.amountDrops,
        maxTimeoutSeconds: input.maxTimeoutSeconds ?? 600,
        extra: { invoiceId: input.invoiceId, sourceTag: input.sourceTag ?? DEFAULT_SOURCE_TAG },
      },
    ],
  };
}

/** Shape the client sends back in PAYMENT-SIGNATURE. */
export interface PaymentSignature {
  x402Version: number;
  accepted: PaymentRequirement;
  payload: { signedTxBlob: string };
}

export interface SettlementResult {
  success: boolean;
  transaction: string | null; // settled tx hash
  payer: string | null;
  network: string | null;
  error?: string;
  raw: unknown;
}

/**
 * Verify + settle a payment with the T54 facilitator.
 *
 * Wire contract (confirmed against x402-xrpl@0.3.1 FacilitatorClient):
 *   POST /verify  { paymentPayload, paymentRequirements } → { isValid, invalidReason?, payer? }
 *   POST /settle  { paymentPayload, paymentRequirements } → { success, transaction, network, payer?, errorReason? }
 *
 * `paymentPayload` is the decoded PAYMENT-SIGNATURE (our `sig`). `paymentRequirements`
 * MUST be the SERVER's authoritative terms (payTo/amount/sourceTag we demanded),
 * carrying the client's invoiceId for binding — NOT the client-echoed copy — so the
 * facilitator's payment_requirements_mismatch / amount / destination checks are real.
 */
export async function settleWithFacilitator(
  facilitatorUrl: string,
  sig: PaymentSignature,
  requirements: PaymentRequirement,
  timeoutMs = 20_000,
): Promise<SettlementResult> {
  const base = facilitatorUrl.replace(/\/$/, '');
  const body = JSON.stringify({ paymentPayload: sig, paymentRequirements: requirements });
  const post = async (
    path: string,
  ): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, json };
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const verify = await post('/verify');
    if (!verify.ok || verify.json.isValid !== true) {
      return {
        success: false,
        transaction: null,
        payer: null,
        network: null,
        error: String(verify.json.invalidReason ?? verify.json.error ?? `verify_failed_${verify.status}`),
        raw: verify.json,
      };
    }
    const verifiedPayer = (verify.json.payer as string) ?? null;

    const settle = await post('/settle');
    const j = settle.json;
    const txHash = (j.transaction ?? j.txHash ?? j.tx_hash) as string | undefined;
    return {
      success: j.success === true && Boolean(txHash),
      transaction: txHash ?? null,
      payer: (j.payer as string) ?? verifiedPayer,
      network: (j.network as string) ?? null,
      error: j.success === true ? undefined : String(j.errorReason ?? j.error ?? `settle_failed_${settle.status}`),
      raw: j,
    };
  } catch (err) {
    return { success: false, transaction: null, payer: null, network: null, error: String((err as Error).message), raw: null };
  }
}
