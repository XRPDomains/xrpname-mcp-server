# v3 → MCP endpoint handoff (2026-07-04)

**Purpose**: Handoff to the `xrpname-mcp-server` team.  While auditing MCP alignment, em identified 20+ backend endpoints v3 consumes that MCP either doesn't know about or could benefit from consuming.  This doc categorises them by priority.

**Audience**: MCP team (external repo `xrpname-mcp-server` v0.1.0).

**MCP currently knows** (in `src/lib/api-endpoints.ts`):
- `/api/xrplnft/getAddress` (with `include=history`)
- `/api/xrplnft/checkDomains`
- `/api/xrplnft/getName`
- `/api/xrplnft/getAllNames` (paginated)
- `/api/xrplnft/getPendingDomains`
- `/api/xrplnft/getOfferByDestination` (legacy)
- `/api/xrplnft/getOfferByOwner` (legacy)

---

## 🔥 High priority — enables new / improved MCP tools

### 1. `GET /api/price/getXrpRate` — live XRP↔USD rate

**Enables**: RLUSD-aware pricing in `register_domain` and `check_domains` responses.

**Signature** (per `v3/js/v3-pricing.js` line 42):
```
GET /api/price/getXrpRate
→ { rate: 0.5234, source: 'coingecko|bitstamp|bitfinex', captured_at: ISO8601 }
```

**Why it matters for MCP**:
- Users increasingly ask AI "how much RLUSD to register alice.xrp?"
- Currently MCP returns only `price_xrp` — user has to convert manually.
- BE already exposes this rate (v3 uses it for the live currency selector).
- Multi-source with fallback (CoinGecko → Bitstamp → Bitfinex per pricing.json).

**Suggested MCP change**:
- New helper `deps.api.getXrpRate()` — returns `{ rate, source, captured_at, age_seconds }`
- Cache 60s (same TTL as pricing.json's `rate_cache_ttl_sec`)
- Add `price_rlusd` field to `check_domains` + `register_domain` responses
- Fall back to `price_xrp` only if rate unavailable

### 2. `GET /api/xrplnft/getOrderbyDomain?domain=<X>` — order state lookup

**Enables**: `check_order_status` tool for register flow follow-up.

**Signature** (per `v3/search.html:832`, `v3/js/v3-mydomains-list.js:1764`):
```
GET /api/xrplnft/getOrderbyDomain?domain=alice.xrp
→ {
    isOK: true,
    data: {
      domain: 'alice.xrp',
      status: 'pending_payment' | 'payment_landed' | 'offer_created' | 'minted' | 'completed' | 'failed',
      payment_tx: 'ABC...',
      offer_id: '...',
      mint_tx: '...',
      created_at: ISO8601,
      ...
    }
  }
```

**Why it matters for MCP**:
- Users register via web, then ask AI "did my alice.xrp register?"
- Currently MCP has no way to answer — must fall back to `check_domains` (which only shows availability).
- This endpoint answers "did BE process my order?" — deeper than availability.

**Suggested MCP tool**:
- New `check_order_status` tool
- Input: `{ domain: string }`
- Description: "Check the backend order status for a domain you tried to register. Returns whether payment landed, offer created, mint completed, or failed at any step."

### 3. `POST /api/domains/AIRecommend` — AI name recommendations

**Enables**: `recommend_domain` tool for creative name discovery.

**Signature** (per `v3/js/v3-ai-recommend.js`):
```
POST /api/domains/AIRecommend
body: {
  query: "tom",
  limit: 8,
  tlds: ['xrp', 'xrpl', 'xrpfi', 'rlusd']   // whitelist
}
→ {
    isOK: true,
    data: [
      { Domain: 'tomcat', Tld: '.xrp', Category: 'nickname' },
      { Domain: 'tomorrow', Tld: '.xrpfi', Category: 'concept' },
      ...
    ]
  }
```

**Why it matters for MCP**:
- Killer AI-agent use case: user says "suggest 5 crypto-themed names for me" → agent taps this endpoint.
- BE runs OpenAI recommender — MCP gets AI value without hosting LLM.
- Similar to how ENS name-suggest tools are the most-used discovery paths.

**Suggested MCP tool**:
- New `recommend_domain` tool
- Input: `{ query: string, limit?: number (default 8), tlds?: string[] }`
- Description: "Get AI-recommended domain suggestions based on a keyword or theme. Returns creative name + TLD combos with categories. Use when a user asks 'suggest names' or 'find me a domain about X'."

---

## 🟡 Medium priority — enrichment for existing tools

### 4. `GET /api/xrplnft/getNFTsbyNFTokenId?nftoken_id=<X>` — reverse lookup

**Enables**: Enriches `check_tx_status` — from a mint tx, get the resulting domain.

**Signature** (per `v3/search.html:2253`):
```
GET /api/xrplnft/getNFTsbyNFTokenId?nftoken_id=00080000...
→ { isOK: true, data: [{ Owner, URI, ... }] }
```

**Why it matters**: after `send_signed_tx` returns a mint tx hash, agents currently can't answer "what domain did I just mint?" without a follow-up `check_domains` call.  This is one call to bridge tx → domain.

### 5. `GET /api/nftdomains/metadata?domain=<X>` — profile metadata

**Enables**: Richer `get_domain_profile` output (avatar, bio, socials).

**Signature** (used in v3 detail.html):
```
GET /api/nftdomains/metadata?domain=alice.xrp
→ { isOK: true, data: { avatar, bio, twitter, github, linked_addresses, ... } }
```

**Why it matters**: MCP's `get_domain_profile` currently returns basic owner + tokenId.  Metadata endpoint adds the social/visual layer users care about.

### 6. `GET /api/xrplnft/getBithompNFT?...` — Bithomp NFT enrichment

**Enables**: Alternative NFT data source when xrpl.js `account_nfts` misses details.

Currently v3 uses this as fallback when direct XRPL query is slow or incomplete.  MCP could adopt as fallback in `get_portfolio` for the same reason.

### 7. `GET /api/xrplnft/getOrdersPending?owner=<X>` — DIFFERENT from getPendingDomains

**Enables**: Clarify pending-order semantics.

**Distinction** (per usage in `v3/js/v3-pending-banner.js:25`):
- `getPendingDomains` (MCP knows) — pending domain **offers** (incoming/outgoing NFT transfers)
- `getOrdersPending` (MCP doesn't know) — pending **registration orders** (paid-but-not-minted domains)

**Impact**: MCP's `get_pending_offers` tool description says it returns "paid-but-not-yet-minted orders (continue-mint candidates)" — but the endpoint MCP uses (`getPendingDomains`) may not include those.  Worth verifying with BE team.

**Suggested action**: Either (a) MCP adds a new tool `get_pending_orders` using `getOrdersPending`, OR (b) BE consolidates into one endpoint.  Check with BE team which is preferred.

---

## 🟢 Low priority — nice-to-have

### 8. `GET /api/refcode/myRefCode` + `GET /api/refcode/myTrans` — referral tracking

**Enables**: `get_referral_stats` tool for users with referral codes.

**Usage**: v3 shows user's referral code + earnings on landing page.  MCP could power a "how much have I earned from referrals?" query for referral holders.

**Priority**: only if MCP audience includes referral partners.  Skip if not.

### 9. `GET /api/auth/current` + `POST /api/auth/signIn` — session-based auth

**Enables**: NOTHING for MCP — MCP is stateless build-tx-not-sign.

**Skip**: these are wallet-signed browser session endpoints.  MCP has no place for them.

### 10. `POST /api/profile/updateInfo`, `POST /api/nftdomains/setavatar` — profile writes

**Enables**: NOTHING for MCP — these require wallet signature + browser session.

**Skip**: FE-only.  If MCP wants profile-write, wrap as a **link** tool (same pattern as `register_domain`, `set_primary_domain`), NOT as a *_tx builder.

---

## Summary table

| Endpoint | MCP action | Priority | New tool? |
|----------|-----------|----------|-----------|
| `/api/price/getXrpRate` | Consume | 🔥 High | No — enriches existing tools |
| `/api/xrplnft/getOrderbyDomain` | Consume | 🔥 High | Yes — `check_order_status` |
| `/api/domains/AIRecommend` | Consume | 🔥 High | Yes — `recommend_domain` |
| `/api/xrplnft/getNFTsbyNFTokenId` | Consume | 🟡 Med | Enrich `check_tx_status` |
| `/api/nftdomains/metadata` | Consume | 🟡 Med | Enrich `get_domain_profile` |
| `/api/xrplnft/getBithompNFT` | Consume as fallback | 🟡 Med | No |
| `/api/xrplnft/getOrdersPending` | Verify vs getPendingDomains | 🟡 Med | Maybe `get_pending_orders` |
| `/api/refcode/*` | Consume | 🟢 Low | Yes — `get_referral_stats` |
| `/api/auth/*` | Skip | — | — |
| `/api/profile/updateInfo` | Wrap as link tool | 🟢 Low | Yes — `update_profile_link` |
| `/api/nftdomains/setavatar` | Wrap as link tool | 🟢 Low | Yes — `set_avatar_link` |
| `/api/xrplnft/createOrder` | Skip (FE-only) | — | — |
| `/api/xrplnft/createTransfer` | Skip (FE-only) | — | — |
| `/api/xrplnft/acceptOfferedOrder` | Skip (MCP builds tx directly) | — | — |
| `/api/xrplnft/setPrimary` | Already wrapped as link | ✓ Done | ✓ `set_primary_domain` |

---

## Recommended MCP v0.2.0 roadmap

**Phase A (RLUSD awareness)** — 2h:
- Wire `/api/price/getXrpRate` into `deps.api`
- Add `price_rlusd` to `check_domains` + `register_domain` responses
- Update tool descriptions

**Phase B (Order status)** — 3h:
- Wire `/api/xrplnft/getOrderbyDomain`
- New `check_order_status` tool
- Update `register_domain` description with "use check_order_status after registration"

**Phase C (AI recommendations)** — 4h:
- Wire `POST /api/domains/AIRecommend`
- New `recommend_domain` tool
- Marketing angle: "the first XRPL AI-native name discovery"

**Phase D (Enrichment)** — 3h:
- Wire metadata + Bithomp fallback into `get_domain_profile` + `get_portfolio`

**Total v0.2.0**: ~12h effort, meaningful UX gains for AI agents.

---

## Handoff notes

- All endpoints verified by grep against v3 code as of 2026-07-04.
- BE contract shape is inferred from FE usage — MCP team should confirm exact JSON shape with BE before wiring.
- Rate endpoint uses same 3-source chain as v3/js/v3-pricing.js — no additional caching layer needed.
- AI recommend endpoint currently has `tlds` whitelist filter — MCP should pass the same 4 TLDs to stay consistent with website suggestions.
- All these endpoints are `v1` prefix — chỉ cần add to `v1` const in `src/lib/api-endpoints.ts`, no version bump required.
