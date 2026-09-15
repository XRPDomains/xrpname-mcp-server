---
name: x402-gateway
description: x402 Gateway for XRPL — a hosted, non-custodial x402 payments gateway. Projects register a projectId and configure where funds go (payTo) and how much (price); any agent or app then pays that project over HTTP 402 with no server code to deploy. Phase 1 is pay-only (tips, donations, pay-per-request, paywalls); pay-to-NFT is on the roadmap. Use when an agent needs to pay a project, or a project wants to accept x402 payments on XRPL.
---

# x402 Gateway for XRPL

A **hosted, multi-tenant, non-custodial** x402 payments gateway on the XRP Ledger.
A project registers once and gets a pay endpoint — **no server to code or deploy.**
Funds settle **payer → the project's wallet directly**; the gateway never holds
funds or keys. Settlement runs through the T54 x402 facilitator.

> **Phase 1 = Pay** (this doc). Pay-to-NFT is on the roadmap (see bottom).

Two audiences: **Projects** (get paid) and **Payers** (agents/apps that pay).

## For projects — get paid (no code)

1. Register a `projectId` and set, in the gateway registry (dashboard, or the
   `gateway-projects.json` file for now):
   - `payTo` — your wallet; funds land here directly.
   - `asset` — `XRP` (Phase 1).
   - `price` — `{ mode: "fixed", amount }` or `{ mode: "range", min, max }` (e.g.
     tips where the payer chooses within a range).
   - optional `successUrl`, `sourceTag`.
2. Share your endpoint: `https://xrpdomains.xyz/x402/{projectId}/pay`.

That's it — the gateway issues the 402 with your `payTo` + price and settles to
you. You never hand the gateway a key, and the payer can't lower the price (the
facilitator rejects a mismatch).

Example registry entry:

```json
{ "projectId": "demo-tips", "name": "Demo Tips", "payTo": "r…",
  "asset": { "code": "XRP" }, "price": { "mode": "range", "min": 0.1, "max": 100 },
  "active": true }
```

## For payers — pay a project

The payer needs a funded XRPL wallet that can sign (dedicated agent wallet; seed
in `.env` for dev, KMS/MPC signer for prod — never a personal main wallet).

```bash
npm install
cp .env.example .env      # set XRPL_SEED
node pay.mjs https://xrpdomains.xyz/x402/demo-tips/pay
```

`pay.mjs` handles the 402, signs the Payment, and prints the receipt.

## HTTP contract

`POST https://xrpdomains.xyz/x402/{projectId}/pay`

1. **No payment header** → **402** with a `PAYMENT-REQUIRED` challenge
   `accepts[0]: { scheme:"exact", network, asset:"XRP", payTo, amount (drops),
   maxTimeoutSeconds, extra:{ invoiceId, sourceTag } }` and body `{ projectId,
   price_xrp }`. This first call is a **free quote** — no charge.
   - For a `range`-priced project, pass the amount: body `{ "amount": 5 }`.
2. **With `PAYMENT-SIGNATURE`** → gateway settles via the facilitator (payer →
   payTo) → **200** `{ paid:true, projectId, amount_xrp, payment_tx, payer,
   success_url }` + a `PAYMENT-RESPONSE` header.

The **price and recipient come from the project registry, never the payer.** The
facilitator recomputes the required amount server-side and rejects an underpaid
or mis-targeted Payment.

## Why the T54 facilitator

No custody, agent-native (pay over plain HTTP 402), no accounts / API keys /
sessions, XRP (RLUSD later), settles in ~4s.

## Safety

- Mainnet = real value. Test small first.
- Never hardcode a price — read it from the 402.
- Never commit a seed; prefer a dedicated low-balance agent wallet.

## Roadmap

- **Phase 2 — Pay-to-NFT:** pay and receive an NFT. Minting needs the issuer's
  key, so it's done keyless-to-the-gateway via a **mint webhook** (the project's
  backend mints and returns the offer) or an XRPL **authorized minter**. The
  buyer then signs one `NFTokenAcceptOffer`. (`buy-nft.mjs` is the payer-side
  reference already included.) XRPName domain registration is the first such
  project.
- **Phase 3:** RLUSD pricing, a self-serve dashboard, platform fees / plans.

Built by XRPName (xrpdomains.xyz/agent) · powered by the T54 x402 facilitator.
