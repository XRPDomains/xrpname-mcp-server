---
name: xrpname-register
description: Buy/register an XRPName domain (.xrp, .xrpl, .xrpfi, .rlusd) on the XRP Ledger via the x402 agentic-payment protocol. Use when an agent needs to buy, register, mint, or claim an XRPL/XRP domain from a wallet it controls. Handles the full flow — request price (HTTP 402), sign the Payment (XRP or RLUSD), then sign the NFTokenAcceptOffer to take custody. Root domains only.
---

# Register an XRPName domain via x402

> **Audience: agent developers.** This skill is for programmatic agents buying
> domains from a wallet the agent controls. It is NOT how a human end-user buys a
> domain — humans use the website and sign with Xaman (seed stays on their phone,
> nothing to paste). Do not hand this to end-users to paste a personal seed.

An agent buys a root XRPName domain end-to-end on XRPL mainnet using **x402**.
The agent signs two XRPL transactions; no private key is ever sent to the
XRPName server or the T54 facilitator.

## Example prompts (what triggers this)

When the user says something like the following, run this skill — check price,
confirm (or honor an approved auto-sign scope), pay, then accept:

- "Buy `alice.xrp` for me." / "Register `mybrand.xrpl`." / "Claim `pay.rlusd`."
- "Is `fund.xrpfi` available? If it's under 20 XRP, register it."
- "Find a short, free `.xrp` domain for 'defi' and register the first one."
- Autonomous: "You may auto-sign domain purchases under 20 XRP for this session.
  Register `a.xrp`, `b.xrpl`, `c.xrpfi`." — apply the cap as a hard constraint and
  never exceed the stated scope.

Always confirm the price with the user before paying unless an explicit spend
scope was given in this session.

## Why two signatures (inherent to XRPL)

XRPL cannot mint an NFT directly into another wallet. `NFTokenMint` mints into
the minting account, and transfer REQUIRES the buyer to sign `NFTokenAcceptOffer`.
So the flow is always:

1. **Payment** — the agent pays. (A normal x402 client already does this.)
2. **NFTokenAcceptOffer** — the agent takes the minted domain NFT. (This second
   signature is what this skill adds on top of a plain x402 payment.)

## The wallet

The agent needs a wallet that can sign arbitrary XRPL transactions (both steps
above), funded on mainnet with ≈ `price + ~1–2 XRP reserve + fees`. Use a
**dedicated, low-balance agent wallet — never a personal main wallet.**

- **Dev / test:** put the seed in `.env` as `XRPL_BUYER_SEED` (gitignored).
- **Production:** hold the key in a KMS / HSM / MPC signer and sign there; the
  seed never enters the agent process. In `buy.mjs`, replace the
  `Wallet.fromSeed(...)` signer with your external signer.

Target must be a **ROOT** domain: one label + a supported TLD (`.xrp`, `.xrpl`,
`.xrpfi`, `.rlusd`). Subnames (`sub.alice.xrp`) are not supported.

## Quickstart

```bash
npm install
cp .env.example .env      # then edit .env: set XRPL_BUYER_SEED
node buy.mjs alice.xrp    # buy a specific domain (pays in XRP)

# Pay in RLUSD instead (wallet must already hold an RLUSD trustline + balance):
PAY_CURRENCY=RLUSD node buy.mjs alice.xrp
```

`buy.mjs` does everything: sends the request, handles the 402, signs the
Payment, then signs and submits the AcceptOffer. On success it prints
`✅ Done — alice.xrp is now in r...`.

## HTTP contract (integrate into your own agent)

Endpoint: `POST https://xrpdomains.xyz/mcp/x402/register`

1. **Request** — body `{ "domain": "alice.xrp" }`, no payment header yet. This
   first call **does not charge anything** — it is a free price quote. Use it to
   show the user the price and confirm before paying.
2. **402 Payment Required** — base64 `PAYMENT-REQUIRED` header with the challenge.
   `accepts[]` lists the payment options the payer may choose from; the payer picks
   one and pays it. `accepts[0]` is always XRP: `{ scheme:"exact", network:"xrpl:0",
   asset:"XRP", payTo, amount (drops, string), maxTimeoutSeconds,
   extra:{ invoiceId, sourceTag } }`. When RLUSD is enabled, `accepts[1]` is the
   RLUSD option: same shape but `asset` = the 40-hex RLUSD currency code, `amount` =
   a decimal RLUSD string, and `extra.issuer` = the RLUSD issuer. Body echoes
   `{ domain, price_xrp }` (plus `price_rlusd` when offered; `amount` is drops for XRP).
   **The server sets the price** (from live pricing.json, by name length + TLD) —
   you cannot choose it. Read `amount` / `price_xrp` from this 402 and pay exactly
   that: the facilitator recomputes the required amount server-side and rejects
   any Payment that doesn't match (`amount_mismatch`), so underpaying just fails.
   Never hardcode a price. Each 402 carries a fresh `invoiceId`; don't reuse a
   signed blob across invoices.
3. **Pay** — sign an XRPL `Payment` of `amount` drops to `payTo`, with
   `SourceTag = extra.sourceTag`, invoice-bound (a `Memo` with
   `MemoData = HEX(UTF-8(invoiceId))`, or `InvoiceID = SHA256(invoiceId)`), and a
   bounded `LastLedgerSequence`. Re-send with a base64 `PAYMENT-SIGNATURE` header
   `{ x402Version:2, accepted:<the requirement>, payload:{ signedTxBlob } }`.
   (The `x402-xrpl` package's `x402Fetch` automates all of this.)
4. **200 OK** — server verified + settled via the facilitator, minted, and returns
   `{ minted, domain, owner, paid_currency, nftoken_id, offer_id, mint_tx,
   payment_tx, accept_offer_template }`, plus a base64 `PAYMENT-RESPONSE` header
   `{ success, transaction, network, payer }`. `paid_currency` is `"XRP"` or
   `"RLUSD"`; RLUSD payments also carry `paid_rlusd` + `locked_rate`.
5. **Take custody** — sign `accept_offer_template` (set `Account = payer`),
   `autofill` + `submit`. `tesSUCCESS` → the domain NFT is in the wallet.

### Example 200 response

```json
{
  "minted": true,
  "domain": "alice.xrp",
  "owner": "rPAYER…",
  "paid_currency": "XRP",
  "nftoken_id": "00080000413DEC6E282BBCEA55B71140D0CB35F01673BBE022700A0604ACA56B",
  "offer_id": "236D3652EAF0239A8FAC81076C0E3BE6B373DEFEC12EE5CE66DC4A7B7068F26D",
  "mint_tx": "…",
  "payment_tx": "C397A0B5…12C1F",
  "accept_offer_template": {
    "TransactionType": "NFTokenAcceptOffer",
    "NFTokenSellOffer": "236D3652EAF0239A8FAC81076C0E3BE6B373DEFEC12EE5CE66DC4A7B7068F26D",
    "Memos": [ { "Memo": { "MemoData": "…hex(alice.xrp)…" } } ]
  }
}
```

Step 5 = take `accept_offer_template`, add `Account = owner`, autofill, sign, submit.

## Integration notes

- **HTTP timeout ≥ 100s.** Minting on the backend can take up to ~90s; the 200
  response (with `offer_id`) only comes back after the mint. A short client
  timeout (e.g. 30s) will abort a successful mint — set your request timeout to
  at least 100s.
- **Idempotency / recovery.** If your call times out but the payment settled, the
  domain is likely minted with a pending offer for the payer. Re-poll
  `getPendingDomains?owner=<payer>` (see below) rather than paying again; the same
  `domain` will now read as taken, so a fresh register returns `409 DOMAIN_TAKEN`.
- **Two requests, one payment.** The no-signature call is a free quote; only the
  call carrying `PAYMENT-SIGNATURE` moves funds. Confirm the quoted price with the
  user between the two.
- **RPC rate limits.** Public XRPL nodes (xrplcluster.com) may return `tooBusy`
  when submitting the AcceptOffer. `buy.mjs` / `accept-offer.mjs` automatically
  rotate through fallback RPCs (s1/s2.ripple.com); set `XRPL_RPC_FALLBACKS` to
  customize. AcceptOffer is idempotent, so a retry on another node is safe.
- **402 body is standard x402 v2.** The response includes a proper `resource`
  object `{ url, description, mimeType }` (not a string), so `x402-xrpl` clients
  parse it without a compat shim.

## Paying in RLUSD

The 402 may offer RLUSD as a second option in `accepts[]` alongside XRP. RLUSD is
an XRPL IOU pegged 1:1 to USD; the server prices it as `XRP price × live XRP/USD
rate` and **locks that amount per-invoice** at quote time, so pay exactly the
`amount` on the RLUSD requirement (the facilitator re-checks it; a stale amount
fails). To pay in RLUSD:

- **Set `PAY_CURRENCY=RLUSD`.** `buy.mjs` then selects the RLUSD `accepts[]` option
  (via a `paymentRequirementsSelector`) and signs an RLUSD `Payment` instead of XRP.
- **Trustline + balance are required.** Sending RLUSD means the wallet must already
  hold an RLUSD trustline to the issuer *and* enough RLUSD balance. `buy.mjs`
  preflights both and stops with `TRUSTLINE_MISSING` or `INSUFFICIENT_RLUSD` rather
  than signing a Payment that would fail on-ledger.
- **Opening the trustline.** Set `RLUSD_AUTO_TRUSTLINE=1` to let the script submit a
  `TrustSet` (costs ~0.2 XRP reserve). It never buys RLUSD for you — after the line
  is open you still fund the wallet with RLUSD yourself, then re-run.
- **Integrating your own client:** pick the `accepts[]` entry whose `asset` is the
  RLUSD currency code, sign a `Payment` whose `Amount` is
  `{ currency, issuer: extra.issuer, value: amount }`, invoice-bound and
  source-tagged exactly as for XRP.

RLUSD is only offered when the merchant has enabled it and its wallet holds an
RLUSD trustline to receive. If you don't see an RLUSD option in `accepts[]`, pay
in XRP.

## Errors & recovery

- **Still 402 after paying** — payment did not complete; check seed / balance.
- **`TRUSTLINE_MISSING` / `INSUFFICIENT_RLUSD`** (RLUSD only) — open an RLUSD
  trustline (`RLUSD_AUTO_TRUSTLINE=1`) and fund the wallet with RLUSD, then re-run.
- **402 `QUOTE_EXPIRED`** (RLUSD only) — the locked RLUSD quote timed out; request a
  fresh 402 and pay within `maxTimeoutSeconds`.
- **400 `UNSUPPORTED_ASSET`** — the chosen `accepts[]` asset isn't offered; pick XRP
  or the advertised RLUSD option.
- **400 `SUBNAME_NOT_SUPPORTED` / `INVALID_INPUT`** — use a root domain.
- **409 `DOMAIN_TAKEN` / `DOMAIN_TAKEN_AFTER_PAYMENT`** — taken first; the second
  is a rare post-payment race — contact support with `payment_tx` for a refund.
- **Minted but AcceptOffer never signed** (client crashed after paying) — the
  domain sits as a pending sell offer for the payer. Recover it:
  ```bash
  node accept-offer.mjs <offer_id>
  ```
  Find `<offer_id>` in
  `GET https://xrpdomains.xyz/api/xrplnft/getPendingDomains?owner=<payer>` under
  `data.incoming[]` (match `domain` + `destination = payer`). The server also
  auto-recovers this inside the 200 response when it can.

## Safety

- Mainnet = **real XRP**. Start with a low-value domain to validate.
- Never expose or commit the wallet seed.
- Always complete step 5. Otherwise the paid NFT stays in an unaccepted sell
  offer (valid up to ~1 year) and is not in the wallet.

## Add this skill to your agent

This is a plain agent skill (a `SKILL.md` + two scripts). Ways for a developer to
adopt it:

- **Claude Code / Cursor / any skills-aware agent:** copy the
  `skills/xrpname-register/` folder into your agent's skills directory. The agent
  reads `SKILL.md` and can run `buy.mjs` when asked to buy a domain.
- **Your own codebase:** ignore the scripts and implement the *HTTP contract*
  above against `POST /mcp/x402/register` with your existing x402 client + XRPL
  signer.
- **Discovery:** the skill lives in the XRPName repo under
  `skills/xrpname-register/`. The registration endpoint is part of the XRPName
  MCP server (`@xrpname/xrpname-mcp`), so agents that already use that MCP can be
  pointed straight at the endpoint.
