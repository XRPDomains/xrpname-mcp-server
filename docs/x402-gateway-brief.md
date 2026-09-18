# x402 Gateway for XRPL — kickoff brief (spin-out product)

Paste this into a fresh session to start the x402 Gateway product without losing
context. This is a **separate product** from the XRPName MCP / domain business.

## Vision

"Stripe for x402 on XRPL." A hosted, **non-custodial**, multi-tenant platform that
lets any XRPL project stand up an **x402 payment endpoint in minutes, no code** —
payable by **both AI agents and humans**. Funds settle payer → the project's own
wallet; the platform never holds funds or keys. Settlement runs through the T54
x402 facilitator. Kept **separate from XRPName MCP** (own brand, domain, repo);
XRPName domains becomes the first dogfood customer.

## Why now

XRPL + T54 are heavily promoting x402. Merchant endpoints are appearing, but every
one still requires devs to code the 402 handshake + facilitator wiring. The gap:
a **no-code, hosted** layer for non-devs — token owners, NFT creators, web3 shops.

## Target segments & jobs-to-be-done

- **Token owners / projects** — tips, subscriptions, paywalled API/content, selling
  services to agents (pay-per-call).
- **NFT creators** — pay-to-mint, memberships, tickets, allowlists (issuer keeps the
  mint key; gateway stays keyless via webhook / authorized-minter).
- **Web3 shops / merchants** — checkout, digital goods, unlock links; funds straight
  to their wallet.
- **Agent builders** — discover + pay these endpoints in one line (skill/SDK).

## Assets already built (currently inside the `xrpname-mcp-server` repo — extract to a new repo)

- `src/routes/x402-gateway.ts` — Phase 1 endpoint `GET|POST /mcp/x402/pay/:projectId`
  (non-custodial; price + payTo decided server-side; free 402 quote; facilitator settle).
- `src/lib/gateway-registry.ts` — project registry (payTo + price) from a JSON file.
- `src/lib/x402.ts` — x402 protocol glue (challenge, decode, facilitator verify/settle).
- `src/lib/mint-adapter.ts` + `src/adapters/xrpdomains-adapter.ts` — issuer-agnostic
  MintAdapter for NFT mode (XRPDomains is the first adapter).
- `skills/x402-gateway/` — agent skill (pay + pay-to-NFT) + clients `pay.mjs` / `buy-nft.mjs`.
- `docs/x402-gateway-page/index.html` — landing mockup (brand-matched).
- `data/gateway-projects.example.json` — sample project config.
- **Proven live on mainnet:** x402 domain mint `xrpl-x402.xrp`
  (payment tx `C397A0B5…12C1F`, accept tx `895F6B8A…458EA`) via the T54 facilitator.

## Core product to build

1. **No-code dashboard** — create a project, set `payTo` + price (fixed/dynamic,
   XRP/RLUSD), get an endpoint instantly. (Today it is a JSON file; upgrade to a UI.)
2. **Agents + humans on one endpoint** — agents pay via x402; humans pay via a
   **hosted checkout + embeddable "Pay with x402" button + Xaman QR** (seed stays on
   their phone).
3. **NFT mode (P2)** — pay-to-mint, keyless to the gateway (mint webhook, or XRPL
   authorized-minter so the issuer's cold key stays offline).
4. **Auto-discovery** — serve each project's `/.well-known/x402`; auto-list on
   xrpl-ai.org directory (free distribution).
5. **Per-project analytics + audit trail** — reuse the XRPName dashboard work
   (payments, volume, agents, tamper-evident audit). Verifiable audit is a
   differentiator.
6. **Strictly non-custodial** — funds settle payer → project wallet; no platform
   custody of funds or keys.

## Differentiation

- No-code + hosted + multi-tenant (removes the server-building step T54's SDK leaves).
- Agents AND humans pay the same endpoint.
- Built-in directory listing + analytics + verifiable audit.
- Credibility: already shipped a live mainnet x402 mint.

## Business model

- Free tier (a few projects, platform SourceTag).
- Paid: more projects, custom domain, RLUSD, VI / x402 Secure, higher limits —
  **subscription** (cleanest under non-custodial).
- Later: run **our own facilitator** (own SourceTag) → per-tx fee + volume on the
  xrpl-ai.org leaderboard.

## Roadmap

- **P1 (mostly built):** pay gateway + endpoint → add no-code dashboard + hosted
  checkout + embeddable button + Xaman for humans; auto `.well-known/x402` + directory listing.
- **P2:** NFT mode (webhook / authorized-minter) + per-segment templates
  (tip jar, API paywall, NFT mint, shop checkout).
- **P3:** RLUSD, custom domains, VI / x402 Secure, own facilitator, billing.

## First moves (ride the x402 wave)

1. Extract to a new repo/brand; deploy P1 + a public demo project; list on
   xrpl-ai.org this week.
2. Stand up a minimal no-code dashboard (projectId + payTo + price).
3. One killer demo per segment; announce, tag @RippleXDev / T54; ask T54 for a case
   study (we are already a live integration).

## References

- T54 facilitator: https://xrpl-x402.t54.ai · XRPL AI hub / directory: https://xrpl-ai.org
- x402 scheme: https://xrpl-x402.t54.ai/docs/xrpl-scheme
- Existing landing mockup: `docs/x402-gateway-page/index.html`
