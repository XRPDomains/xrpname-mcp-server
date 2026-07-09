# xrpname-mcp-server — Audit vs v3 changes (2026-07-04)

**Scope**: Impact of recent v3 changes on the MCP server at `xrpname-mcp-server`.

**TL;DR**: 🟢 **No blocker updates required.**  MCP is already aligned with v3 for launch.  A few nice-to-haves listed at the bottom for post-launch.

---

## Recent v3 changes checked

| # | Change | Impact on MCP |
|---|--------|---------------|
| 1 | Adapter memo in Payment tx | **None** — MCP delegates register flow to browser |
| 2 | Session ID checkpoint memo | **None** — same reason |
| 3 | Client-only order recovery | **None** — client-side only |
| 4 | Wallet Kit 0.1.6 upgrade | **None** — MCP doesn't consume the kit (build-tx-not-sign pattern) |
| 5 | `/app` → `/search` redirect | **None** — MCP already uses `/search` in `web-fallback-url.ts` |
| 6 | pricing.json per-TLD tables | **None** — MCP pricing formula matches |
| 7 | RLUSD payment support | Nice-to-have — see below |

## Detailed alignment check

### ✅ Pricing formula — IN SYNC

MCP `src/lib/pricing.ts` uses `basePriceXrp × tierMultiplier` formula:

| Tier | MCP calculated | pricing.json actual | Match |
|------|---------------|---------------------|-------|
| 1 char | 10 × 400 = 4000 | 4000 | ✓ |
| 2 char | 10 × 200 = 2000 | 2000 | ✓ |
| 3 char | 10 × 30 = 300 | 300 | ✓ |
| 4 char | 10 × 6 = 60 | 60 | ✓ |
| 5-6 char | 10 × 2 = 20 | 20 | ✓ |
| 7-9 char | 10 × 1.5 = 15 | 15 | ✓ |
| 10+ char | 10 × 1 = 10 | 10 | ✓ |
| Subname | 1 XRP flat | 1 XRP flat | ✓ |
| Discount | 50% | 50% (launch promo) | ✓ |

Defaults in `src/config.ts`: `basePriceXrp=10, discountPercent=50` — matches production.

### ✅ TLD list — IN SYNC

MCP `src/lib/domain-validator.ts` line 6:
```ts
export const TLDS = ['.xrp', '.xrpl', '.xrpfi', '.rlusd'] as const;
```
Matches pricing.json exactly.

### ✅ URL routes — IN SYNC (no /app legacy)

MCP `src/lib/web-fallback-url.ts` already uses:
- `/search?prefill=<domain>&refcode=<code>` — registration
- `/name/<domain>` — profile
- `/mydomains` — portfolio

None reference `/app`.  Chú's `/app → /search` redirect fix on IIS doesn't affect MCP responses.

### ✅ Register flow delegation — CORRECT PATTERN

MCP `src/tools/register-domain.ts` explicitly delegates:

> **"on-chain registration needs a backend `createOrder` callback plus an exact price/memo match for the Payment. Getting that wrong on mainnet means real XRP spent with no minted NFT. The website already owns that flow (order creation + wallet signing), so we delegate to it — the safe choice."**

This is why:
- Adapter memo → FE-only concern
- SessionId checkpoint → FE-only concern
- BE `createOrder` contract → FE-only concern

MCP `register_domain` returns a **link** to `/search?prefill=<name>`, user completes in browser.  Recent v3 changes don't touch that link contract.

### ✅ Write-path tools (transfer/accept/cancel/burn) — UNAFFECTED

MCP builds unsigned tx for:
- `transfer_domain_tx` — NFTokenCreateOffer
- `accept_offer_tx` — NFTokenAcceptOffer
- `cancel_offer_tx` — NFTokenCancelOffer
- `burn_domain_tx` — NFTokenBurn

None of these involve Payment memos.  v3 recent changes touched only Payment tx (register flow).

### ✅ API endpoints consumed — UNCHANGED

MCP calls (via `src/lib/api-endpoints.ts`):
- `/api/xrplnft/getAddress`
- `/api/xrplnft/checkDomains`
- `/api/xrplnft/getName`
- `/api/xrplnft/getAllNames`
- `/api/xrplnft/getPendingDomains`

None of these BE endpoints were touched in recent v3 work.  `createOrder` is FE-only.

---

## Nice-to-have improvements (post-launch)

Not blockers.  Ship v0.1.0 as-is for launch.  These would land in v0.2.0.

### 🟡 1. RLUSD payment awareness in `register_domain`

Currently returns only `price_xrp`.  AI agents don't know RLUSD is an option.

**Change**: Add fields to the response:

```ts
const payload = {
    domain: parsed.domain,
    available: true,
    price_xrp: priceXrp(...),
    // NEW
    payment_currencies_supported: ['XRP', 'RLUSD'],
    payment_note: 'The web app supports paying in XRP or RLUSD (Ripple\'s stablecoin). Rate locked at sign-time.',
    // ...
};
```

**Effort**: 15 min.  No new deps.

### 🟡 2. Live RLUSD price display

Compute `price_rlusd` alongside `price_xrp` at query time.

**Change**: Fetch XRP→USD rate at boot (with 60s cache), multiply price_xrp × rate.

**Effort**: ~2h — need to plumb rate source into `deps.ts`, add caching, handle failure.

**Trade-off**: adds network dep at MCP boot.  Not worth for launch.  Defer to v0.2.0.

### 🟡 3. Fetch pricing.json from web at boot

Currently `pricing.ts` mirrors formula in code.  If chú changes tier prices in pricing.json later, MCP drifts.

**Change**: Fetch `${webBase}/v3/data/pricing.json` at boot, cache 1h, fall back to hardcoded on 404.

**Effort**: ~1h.

**Trade-off**: extra network dep, marginal benefit (chú rarely changes prices).  Defer.

### 🟡 4. Update README + specs

Bump README status from "Phase 4 (transfer flow)" to whatever chú calls the current state.  Refresh specs/XRPDomains-MCP-Server-Spec-v2.md if BE contract v2 planned.

**Effort**: 30 min.

### 🟡 5. Consider `search_url` param name

MCP passes `?prefill=<domain>`.  v3 search.html accepts `?q=<domain>` in some paths (per the ?q=... comment em saw earlier).  Verify both work; standardise on one.

**Effort**: 15 min.  Check search.js `?q=` handler.

---

## Recommended action

**For launch (Week 1)**: No MCP changes.  Current v0.1.0 is safe and aligned.

**For v0.2.0 (Week 2-3 post-launch)**: Ship #1 (RLUSD awareness in response) + #4 (README refresh).  Skip #2/#3 unless chú gets user feedback asking for RLUSD price in AI responses.

**No breaking changes** to MCP contract expected in near term.  Existing MCP integrations (Claude Code, Claude Desktop, Codex) keep working with 0.1.0.

---

## Files audited

- `src/lib/pricing.ts`
- `src/config.ts`
- `src/lib/domain-validator.ts`
- `src/lib/web-fallback-url.ts`
- `src/lib/api-endpoints.ts`
- `src/tools/register-domain.ts`
- `src/tools/check-domains.ts`
- `src/tools/{transfer,accept-offer,cancel-offer,burn-domain}-tx.ts`
- `README.md`, `package.json`
