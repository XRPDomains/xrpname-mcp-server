# Content & design brief — x402 autonomous payments page

**For:** website team
**Author:** XRPName MCP
**Status:** proposal
**Related:** `/agent` (existing MCP landing page), `POST /mcp/x402/register`, `/mcp/stats`

> **Routing note:** the site's rewrite layer doesn't nest paths, so the new page is a single
> top-level route **`/x402`** — not a nested `/agent/x402`.

---

## 1. Recommendation: a dedicated page, not a section on `/agent`

Make a new **top-level page `/x402`** (nav label: **"Agent payments"** or **"x402"**), and add a
single promo section + nav link on the existing `/agent` page that points to it.

**Why separate, not merged into `/agent`:**

- **Opposite mechanic.** `/agent` sells "read-only + web-link, the server never builds a
  transaction, 0 private keys." x402 is the inverse: the agent signs a real XRPL `Payment`
  with its own wallet and registers autonomously — no browser handoff. Putting both on one
  page muddies the clean "0 keys / nothing to sign" promise that page is built around.
- **Different audience.** `/agent` targets a person wiring Claude/Cursor to look up names and
  get a register link. x402 targets **autonomous agents and agent developers** with a funded
  wallet — the machine-payments / x402 ecosystem, and directories like xrpl-ai.org.
- **Different safety story.** x402 needs its own explanation: the agent holds a seed
  client-side, two signatures (Payment + AcceptOffer), RLUSD trustlines. That doesn't belong
  in the middle of the "the server holds no keys, no sessions" FAQ.
- **Marketing surface.** x402 (verifiable on-chain payments, XRP + RLUSD, the x402 standard) is
  a flagship differentiator worth its own SEO page, OG image, and directory link target.

Keep the same visual system, tone, and component style as `/agent` so the two feel like one
product.

---

## 2. Changes to the existing `/agent` page

1. **Nav:** add `Agent payments` (→ `/x402`) next to `For Agents`.
2. **`register_domain` tool card:** append one line —
   > *Prefer autonomous payment? Agents with their own wallet can pay + register in one call via
   > [x402 →](/x402) — no browser handoff.*
3. **New promo section** (place after "What the agent can do", before "Available on every
   channel"):

   **Heading:** `Agents that pay for themselves`
   **Body:** `The read tools are hands-off by design. When an agent has its own wallet, the
   x402 endpoint lets it register a domain end-to-end — pay in XRP or RLUSD, mint, and take
   custody — without a person in the loop. Non-custodial: the server never holds a key.`
   **CTA:** `Explore x402 →` (→ `/x402`)
   **Stat chips:** `XRP + RLUSD` · `x402 v2` · `on-chain verifiable` · `server holds 0 keys`
4. **FAQ:** add one Q —
   > **Can an agent pay and register on its own?**
   > Yes — via the x402 endpoint, an agent with its own funded wallet signs the XRPL payment
   > itself (XRP or RLUSD) and registers autonomously. The read/web-link tools above stay
   > hands-off; x402 is the opt-in autonomous path. [Learn more →](/x402)

---

## 3. New page `/x402` (top-level) — full content spec

Mirror the `/agent` layout: hero → stat line → how it works → the endpoint → payment options →
setup → safety → verifiable → prompts → FAQ → CTA.

### 3.1 Hero

- **Eyebrow:** `x402 · agentic payments on XRPL`
- **H1:** `Register a domain autonomously — the agent pays`
- **Sub:** `With x402, an AI agent that controls a wallet buys and registers an XRPName domain
  in one HTTP call: it signs the XRPL payment itself — in XRP or RLUSD — mints, and takes
  custody. No browser, no human click. The server and facilitator hold no private keys.`
- **Buttons:** `How it works` (#how) · `Live activity →` (`/mcp/stats`)
- **Stat line:** `2 assets (XRP · RLUSD)` · `x402 v2` · `T54 facilitator` · `0 keys held by server` · `root domains`

### 3.2 How it works (numbered, 5 steps)

Title: **One request, one payment, one custody signature**

1. **402 quote** — Agent `POST`s `{ "domain": "alice.xrp" }`. Server replies **402 Payment
   Required** with a `PAYMENT-REQUIRED` challenge listing every payment option in `accepts[]`
   (XRP, and RLUSD when offered). This call charges nothing — it's a price quote.
2. **Sign the payment** — Agent picks an option and signs an XRPL `Payment` for the exact
   amount to the merchant, invoice-bound and source-tagged. (The `x402-xrpl` client automates
   this.)
3. **Settle** — Agent re-sends with a `PAYMENT-SIGNATURE` header. The server verifies + settles
   through the T54 facilitator. The server never holds the key; the agent signed.
4. **Mint** — On settlement the backend mints the domain NFT and returns `offer_id` +
   an `accept_offer_template`.
5. **Take custody** — Agent signs the `NFTokenAcceptOffer` (its own wallet) and the domain
   lands in the agent's wallet. `tesSUCCESS` → done.

Footnote: *Two signatures are inherent to XRPL — an NFT can't be minted directly into another
wallet, so the buyer signs the AcceptOffer to take it. Root domains only via x402.*

### 3.3 The endpoint (code block, like the "canonical connection" section)

- **Endpoint:** `POST https://xrpdomains.xyz/mcp/x402/register`
- **Also:** `GET` the same URL returns a representative 402 quote for discovery/verification.
- **Protocol:** x402 v2 · scheme `exact` · network `xrpl:0` (mainnet)
- **Discovery:** listed in `/.well-known/x402.json`

```
# Discover the payment options (free quote, no charge)
curl -s https://xrpdomains.xyz/mcp/x402/register | jq '.accepts[] | {asset, amount, extra}'
```

Show the shape of a 402 `accepts[]` entry:

```
{
  "scheme": "exact",
  "network": "xrpl:0",
  "asset": "XRP",                       // or the 40-hex RLUSD currency code
  "payTo": "raAyaz…v1q9",
  "amount": "7000000",                  // drops (XRP) or a decimal string (RLUSD)
  "maxTimeoutSeconds": 600,
  "extra": { "invoiceId": "XRPNAME-alice.xrp-…", "sourceTag": 804681468 }
  // RLUSD options also carry extra.issuer
}
```

### 3.4 Payment options — XRP & RLUSD (two cards)

**XRP** — `Pay in native XRP. Price comes straight from xrpdomains.xyz pricing (by name length
+ TLD). The facilitator re-checks the amount, so the agent just pays what the 402 quotes.`

**RLUSD** — `Pay in RLUSD (Ripple's USD stablecoin). The server prices it as the XRP price ×
the live XRP/USD rate and locks that figure per-invoice. The paying wallet must hold an RLUSD
trustline and balance; if it doesn't, the client tooling stops with a clear TRUSTLINE_MISSING
message before signing anything.`

Small print: `The payer chooses which option to pay — the server offers both in accepts[].`

### 3.5 Setup — the register skill

Title: **Wire it into your agent**

`XRPName ships an agent skill (SKILL.md + buy.mjs) that runs the whole flow: quote → sign
payment → settle → sign AcceptOffer. Point your agent's skills directory at it, or implement
the HTTP contract above against your own x402 client + XRPL signer.`

Code (terminal):

```
# from skills/xrpname-register
npm install
cp .env.example .env        # set XRPL_BUYER_SEED (a dedicated, low-balance agent wallet)

node buy.mjs alice.xrp                 # pay in XRP
PAY_CURRENCY=RLUSD node buy.mjs alice.xrp   # pay in RLUSD (needs trustline + balance)
```

Note: `Use a dedicated agent wallet — never a personal main wallet. In production, keep the key
in a KMS/HSM/MPC signer and swap the signer in buy.mjs; the seed never enters the process.`

### 3.6 Safety (mirror the /agent "Common questions" tone)

- **Who holds the keys?** `Nobody but the agent. XRPName's server and the T54 facilitator hold
  no private keys. The agent signs both the Payment and the AcceptOffer with its own wallet.`
- **What's the wallet?** `A dedicated, funded agent wallet. The seed lives only in the agent's
  environment (never committed, never sent to the server).`
- **RLUSD trustline?** `To send RLUSD the wallet needs a trustline to the RLUSD issuer and a
  balance. The client preflights this and refuses to sign if it's missing.`
- **Can the server overcharge?** `No. The price is server-set from public pricing and the
  facilitator re-verifies the settled amount; a mismatched payment just fails.`

### 3.7 Verifiable (the differentiator — link the dashboard)

Title: **Every payment is on-chain and public**

`x402 settlements are real XRPL transactions. The live dashboard shows each register payment —
amount, asset (XRP/RLUSD), payer, and the on-ledger tx hash — plus a tamper-evident audit
trail of every request.`

CTA: `See live x402 activity →` (`/mcp/stats`)
Secondary: `Listed on xrpl-ai.org` (link the directory entry)

### 3.8 Example prompts (like /agent's prompt grid)

- `Register alice.xrp for me and pay in RLUSD.`
- `Buy mybrand.xrpl, settle with XRP.`
- `Is fund.xrpfi available? If it's under 20 XRP, register and pay for it.`
- `You may auto-sign domain purchases under 20 XRP this session — register a.xrp, b.xrpl.`

### 3.9 FAQ

- **Do I need a wallet with funds?** Yes — x402 is for agents that control a funded wallet.
  The read tools on `/agent` need nothing; x402 is the autonomous purchase path.
- **XRP or RLUSD?** Either — the 402 lists both when RLUSD is enabled; the agent picks. RLUSD
  needs a trustline + balance on the paying wallet.
- **Is it mainnet?** Yes, mainnet, real value. Start with a low-value name to validate.
- **What if my call times out after paying?** The domain is likely minted with a pending offer
  for the payer — re-poll pending offers and sign the AcceptOffer; don't pay again.
- **Root domains only?** Yes — subnames are minted by the parent owner through a different path.

### 3.10 Closing CTA

`Give your agent a wallet and a name.` → button `Read the skill →` (GitHub `skills/xrpname-register`)
· `Live activity →` (`/mcp/stats`)

---

## 4. SEO / meta (for the new page)

- **title:** `XRPName x402 — Autonomous XRPL domain registration for AI agents`
- **description:** `With x402, an AI agent pays and registers .xrp / .xrpl / .xrpfi / .rlusd
  domains itself — signing the XRPL payment (XRP or RLUSD) with its own wallet. Non-custodial,
  on-chain verifiable.`
- **keywords:** `x402, xrpl, agentic payments, ai agent wallet, rlusd, machine payments, xrpname, autonomous registration`
- **og:image:** new asset, e.g. `/img/agent/og-x402.png`

---

## 5. Facts the copy must stay accurate to (do not paraphrase loosely)

- Endpoint: `POST` **and** `GET` `https://xrpdomains.xyz/mcp/x402/register`.
- x402 **v2**, scheme `exact`, network `xrpl:0`, facilitator **T54** (mainnet).
- Assets: **XRP** and **RLUSD**; RLUSD price = XRP price × live XRP/USD, **locked per-invoice**;
  RLUSD requires a **trustline** on both payer and merchant.
- **Two signatures**: Payment + NFTokenAcceptOffer, both by the agent's wallet.
- **Non-custodial**: server + facilitator hold **no** private keys.
- **Root domains only** via x402.
- Verifiable at **`/mcp/stats`**; discoverable via **`/.well-known/x402.json`** and **xrpl-ai.org**.
