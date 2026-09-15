# Verifiable Intent (VI) — how to make our x402 payments "verified"

## Why our tx shows "Unverified intent"

On xrpl-ai.org an XRPL x402 payment is flagged **Unverified intent** when it
settled as a plain payment — no **Mastercard Verifiable Intent (VI)** chain and no
x402 Secure risk gating attached.

Ours is unverified because:
- the **payer** used `x402Fetch` (plain), which does not attach a VI chain, and
- our **server's 402** does not advertise an `extensions.x402Secure` policy, so the
  facilitator never evaluates VI.

**VI must be attached at payment time — a settled tx cannot be verified
retroactively.** This plan is for *future* payments.

## What VI is

x402 Secure implements a three-layer signed chain checked by the facilitator +
Trustline (Mastercard "Agent Pay for Machines" framework; T54 is a launch partner):

- **L1** — a Know-Your-Agent credential, issued by your Trustline org (issuer key).
- **L2** — an owner-signed delegation with spend limits (owner P-256 key).
- **L3** — a per-payment agent signature (agent P-256 key).

The chain rides in the payment under `extensions.x402Secure.verifiableIntentChain`.
The risk engine makes the final call and can deny even a valid chain.

## Prerequisites (manual, one-time — you must do this)

1. Register an org at **portal.t54.ai**, verify email, sign in.
2. Integrations page → **Enable Verifiable Intent** (provisions your issuer key).
3. Copy the **Issuer Secret** (shown once). Store as a deployment secret; never
   commit or expose client-side. (Rotate on the same page if lost.)

Env (server-side only):
```
TRUSTLINE_API_URL=https://api.trustline.t54.ai
TRUSTLINE_VI_ISSUER_SHARED_SECRET=vi_sec_...   # from the Portal, shown once
```

## Two changes needed

### A) Payer side — attach the VI chain

Replace `x402Fetch` with **`x402Purchase` + `RemoteIssuerProvider`** (TypeScript):

- Generate two P-256 JWKs: **owner** (signs L2) and **agent** (signs L3).
- `issuer` hook mints **L1**: `POST {TRUSTLINE_API_URL}/api/v1/validation/issue-l1`
  with header `X-VI-Issuer-Secret` + an `Idempotency-Key`. → `{ l1Credential:{ sdJwt } }`.
- `issueRequest` sets `subject: did:pkh:xrpl:<payer>`, `allowedChains:["xrpl"]`,
  `allowedAssets:["XRP"]`, `spendingCeiling` (drops→XRP from the quote).
- Call `x402Purchase({ url, wallet, network, schemeFilter:"exact",
  verifiableIntentProvider: provider, confirmationMode:"auto" })`.
- The SDK requests the 402, builds L1→L3 bound to that invoice, presigns the
  Payment with the chain embedded, and submits. On success `PAYMENT-RESPONSE`
  carries an x402Secure receipt (`decision_id`, receipt id, settled tx hash).

**Production split (recommended):** the Issuer Secret stays on a server route
(`/api/vi/issue-l1`); the owner/agent keys live client-side and never leave it.
The single-process example in the T54 guide collapses this for clarity.

### B) Merchant side — advertise x402 Secure on our 402

VI is only evaluated for x402-Secure-enabled resources. Our hand-built 402
(`src/lib/x402.ts` `buildChallenge`) does **not** emit an `extensions.x402Secure`
policy, so today our own endpoints can't produce a verified tx. Options:

1. **Adopt the SDK server middleware** — `requirePayment` from `x402-xrpl/express`
   (handles the x402 Secure challenge + facilitator VI path). Our server is
   Fastify, so this needs an Express-compat layer or a port of the middleware.
2. **Extend our challenge** — add the `extensions.x402Secure` policy block to
   `buildChallenge`, and route verify/settle through the facilitator's VI-aware
   path. More work, keeps our stack.

Decision needed: adopt SDK middleware vs extend our own challenge.

## Fastest way to a single verified tx (to prove it out)

Point the VI-enabled payer at a resource that **already** advertises x402 Secure
(e.g. the T54 Sample Agent's demo resource), and confirm it shows verified on
xrpl-ai.org. Then do change (B) so *our* endpoints (register / gateway) mint
verified payments too.

## Notes / gotchas

- `VI_ISSUER_NOT_ALLOWLISTED` → VI enabled for a different org than the Issuer
  Secret, or the secret was rotated. Re-copy the current secret.
- Verified chain but still denied → risk engine call; use a clean, funded wallet
  with realistic spacing (a rapid-fire test wallet gets flagged).
- `402` instead of success on the paid retry → the resource's 402 didn't carry an
  `extensions.x402Secure` policy, or `XRPL_NETWORK` mismatched the quote.

## Where this fits our roadmap

VI is an **optional, additive trust layer** — good default for production/
higher-value agent payments. For the x402 Gateway it becomes a per-project toggle
("require Verifiable Intent") in a later phase, once (B) is done on our side.

## Sources
- T54 VI Agent Integration Guide: https://xrpl-x402.t54.ai/docs/verifiable-intent/agent-guide
- T54 VI concept: https://xrpl-x402.t54.ai/docs/verifiable-intent
- xrpl-ai.org Build (x402 Secure / VI overview): https://xrpl-ai.org/build
