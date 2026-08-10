# `POST /api/xrplnft/createOrder` — MCP handoff for x402 flow

**Purpose:** so the MCP server can register a domain end-to-end on behalf of an AI agent (via x402 payment) without going through the browser sign flow. FE currently uses this endpoint to trigger the full mint pipeline after the buyer's Payment tx has landed on-chain.

**Status:** derived from `v3/search.html` `mintDomain()` (lines 1405-1600) — authoritative reference for the current C# backend contract as of 2026-08-07.

---

## 1 · Endpoint

```
POST https://xrpdomains.xyz/api/xrplnft/createOrder
Content-Type: application/json
```

**Preconditions (agent must satisfy BEFORE calling):**

1. Payment tx already **submitted + validated on XRPL mainnet**. Tx hash needed as `payment_tx`.
2. Payment destination = platform contract wallet (available via `GET /api/config/pricing.json` or the C# config). For mainnet the contract wallet address is what `networks-mainnet.js#contractAddress` exposes.
3. Payment amount = the exact price computed from `pricing.json` for the chosen `(domain, tld)`. Backend re-verifies both amount and destination on the chain.
4. If paying in RLUSD: buyer wallet must have RLUSD trust line set to the RLUSD issuer.

**Postconditions (backend does after this call succeeds):**

- Verifies payment tx on XRPL
- Inserts order row in DB (idempotent per `domain`)
- Fires internal call to Node mint service (`xrpdomains.js` → `/mintDomain`) which does `NFTokenMint` + `NFTokenCreateOffer` from the platform issuer wallet
- Returns `nftoken_id` + `offer_id` — the sell offer is destined to `owner` (buyer)
- **Buyer still needs to sign `NFTokenAcceptOffer`** to take custody of the NFT. See §5.

---

## 2 · Request body — full param list

Extracted from `objOrder` builder in `search.html:1446-1527`. All fields sent as flat JSON.

| Field | Type | Required | Value / notes |
|---|---|---|---|
| `domain` | string | ✓ | **Full domain WITH the TLD suffix.** Lowercase, no whitespace. Example: `"alice.xrp"` (not `"alice"`). Verified from `search.html:1379` — `mintDomain(fulldomain, ...)` passes the full string. Backend uses this exact value to compute the NFT URI (`base_uri + domain`) and to key the DB row. |
| `payment_tx` | string | ✓ | Hex hash of the Payment tx that landed on XRPL. 64-char uppercase. |
| `buyer` | string | ✓ | XRPL classic address (`r...`) of the buyer (payer). |
| `owner` | string | ✓ | XRPL classic address that will receive the NFT sell offer. For self-purchase: same as `buyer`. For gift/agent-on-behalf: end-user's address. |
| `issuer` | string | ✓ | Platform contract wallet address (mints from here). Read from `networks-mainnet.js#contractAddress`. |
| `receiver` | string | ✓ | Same as `issuer` — the Payment destination. Backend cross-checks against the on-chain Payment tx `Destination`. |
| `amount` | number | ✓ | Final amount the buyer paid (post-discount). In XRP if `payment_currency === "XRP"`, in RLUSD if `payment_currency === "RLUSD"`. Human units, not drops. |
| `price` | number | ✓ | **Pre-discount base price** for `(domain, tld)` from `pricing.json`. Backend uses this to sanity-check the discount tier. For `.xrp` 4-char = 60, `.xrpfi` 4-char = 60, etc. Look up via `V3Pricing.getBasePriceXRP(domain, tld)` — or replicate the pricing.json logic MCP-side. |
| `base_uri` | string | ✓ | **NFT metadata JSON endpoint prefix.** Value from `networks-mainnet.js#baseUri` — on mainnet: `"https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/"`. Backend concatenates `base_uri + domain` → final NFT URI e.g. `"https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/alice.xrp"`. This URI is what wallets/marketplaces fetch to render name + image + attributes. **NOT the frontend profile URL** (`xrpdomains.xyz/name/{domain}`) — different thing. |
| `network` | string | ✓ | `"MAINNET"` or `"TESTNET"`. Read from `networks-mainnet.js#networkType`. |
| `uri` | string | ✓ | Left empty `""` — backend builds the actual URI from `base_uri + domain`. |
| `url` | string | ✓ | Full metadata URL — `base_uri + domain` (e.g. `"https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/alice.xrp"`). Same value BE embeds into the NFT `URI` field as hex. Redundant with `uri`; both fields sent for compat. |
| `uuid` | string | ✓ | Client session UUID. Used as Pusher channel key for real-time status updates during mint. Generate a v4 UUID per order. |
| `payload_uuid` | string | ✓ | Duplicate of `uuid` (legacy from Xaman payload naming). Just pass the same value. |
| `ismobile` | boolean | ✓ | `false` for MCP server (server-side, not mobile browser). |
| `nftoken_id` | string | ✓ | Left empty `""` for fresh mint. Non-empty only for pre-minted transfers (`createTransfer` flow — not used for register). |
| `adapter` | string | ✓ | Identifier for the wallet SDK that produced the Payment. For MCP/x402 use `"x402"` or `"mcp-x402"` (BE may need to accept this new string — coordinate). Existing values include `walletkit-crossmark`, `walletkit-xaman`, etc. |
| `extension` | boolean | ✓ | `true` for browser-extension wallets, `false` for Xaman/mobile push. For MCP x402 → `true` (not a mobile push flow). |
| `refcode` | string | ✓ | Referral code that credits the referrer. Empty string `""` if none. |
| `setPrimary` | boolean | ✓ | Whether to also set this domain as the buyer's primary name in the same tx. FE currently forces `false` until updateInfo endpoint stabilises. Pass `false` for MCP. |
| `isVerify` | boolean | ✓ | Discriminator for BE payment verification. `true` = buyer submitted a signed tx (we have a hash) → tx hash + on-chain lookup path. `false` = message-signature-only path. For x402 use `true` (payment was submitted on-chain). |
| `payment_currency` | string | ✓ | `"XRP"` or `"RLUSD"`. |

### Additional fields when `payment_currency === "RLUSD"`

Sent as flat top-level fields (via `V3RlusdPayment.buildOrderPaymentBlock` in `js/v3-rlusd-payment.js:178`):

| Field | Type | Value |
|---|---|---|
| `locked_rate` | number | Exchange rate `XRP/USD` locked at Payment time. Backend uses this to reproduce the RLUSD amount and detect drift/fraud. |
| `locked_at` | number | Unix seconds — when the rate was locked (Payment build time). |
| `locked_source` | string | Where the rate came from: `"coingecko"`, `"bitstamp"`, `"bitfinex"`, `"cached"`. |
| `rlusd_amount` | string | The exact RLUSD amount paid, as a decimal string (matches the Payment tx `Amount.value`). |
| `rlusd_issuer` | string | RLUSD issuer address on XRPL — read from `pricing.json#currencies.RLUSD.issuer`. |
| `rlusd_currency_code` | string | RLUSD currency code (hex or 3-char) — read from `pricing.json#currencies.RLUSD.currency_code`. |

---

## 3 · Response body

```json
{
  "status": true,
  "msg": "Success",
  "data": {
    "isOK": true,
    "domain": "alice.xrp",
    "owner": "rBuyer...",
    "uri": "68747470733a2f2f...",   // hex of "https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/alice.xrp"
    "mint_tx": "E1B2C3D4...",       // XRPL tx hash of NFTokenMint (if synchronous)
    "nftoken_id": "000800000023...",// full XRPL NFTokenID
    "offer_id": "5B3A...",          // NFTokenSellOffer index — buyer accepts this
    "create_offer_tx": "F5A6..."    // XRPL tx hash of NFTokenCreateOffer
  }
}
```

**Success criteria:** `status === true && data.isOK === true && data.offer_id !== ""`.

**Async note:** the Node mint service also fires **Pusher events** on channel `xrpdomains_pusher`, event = the `uuid` you sent. Two events per order:
- `{ domain, mint_tx, nftoken_id, uri }` after NFTokenMint success
- `{ domain, create_offer_tx, offer_id }` after NFTokenCreateOffer success

MCP can subscribe if it wants live progress; otherwise the sync HTTP response already contains both fields once mint completes (Node service `submitAndWait`s on chain).

---

## 4 · Failure modes

| Failure | Cause | MCP handling |
|---|---|---|
| `payment_tx` not found on chain | Agent called too early, before validation | Retry with backoff (5s, 15s, 30s) up to 2 min. XRPL validation is ~4-6s. |
| `payment_tx` amount mismatch | MCP calculated a different price than pricing.json says | Re-read `/api/config/pricing.json`, recompute, refund buyer if over-paid (BE has refund pipeline). |
| Domain already owned | Race: someone registered between availability check + payment | BE auto-refunds via existing pipeline. MCP must inform user. |
| `data.isOK === false` | BE internal error — mint failed after payment landed | Order pinned in `/api/xrplnft/getPendingDomains?owner=X` — safe to retry later via recovery endpoint, no fund loss. |
| Timeout (Node mint > 60s) | XRPL congestion or Node service slow | Retry the same call — `_mintOneItem` is idempotent per domain (BE checks existing NFT owner before re-mint). |

---

## 5 · Post-createOrder — NFTokenAcceptOffer step

**Important:** `createOrder` succeeds when the NFT is minted + sell offer created. But the buyer's wallet must sign `NFTokenAcceptOffer` for the NFT to move into their wallet.

In FE flow, buyer signs this step via wallet kit. For MCP x402, MCP has 3 options:

### Option A — Agent (buyer) signs Accept via their wallet
MCP returns `offer_id` to the user's client, user signs Accept themselves. Same UX as web flow. This is safest.

### Option B — MCP wallet acts as buyer AND accepts
If MCP is holding a wallet that paid for the domain (agent-owned wallet), MCP signs Accept itself. Tx:

```json
{
  "TransactionType": "NFTokenAcceptOffer",
  "Account": "<same buyer address>",
  "NFTokenSellOffer": "<offer_id from createOrder response>",
  "Memos": [{ "Memo": { "MemoData": "<hex of domain string>" } }]
}
```

Submit via any XRPL client (`xrpl.js` `client.submitAndWait`) and wait for `tesSUCCESS`.

### Option C — Skip Accept, let buyer claim later
The sell offer sits on-chain for 365 days (BE sets `Expiration`). Buyer can accept anytime via `/mydomains` → Pending banner → Continue. Only viable if MCP + buyer are separate parties.

---

## 6 · Complete sample request (XRP payment)

```json
POST https://xrpdomains.xyz/api/xrplnft/createOrder
Content-Type: application/json

{
  "domain": "alice.xrp",
  "payment_tx": "A1B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCDEF1234",
  "buyer": "rBuyer1234567890abcdefABCDEF1234567",
  "owner": "rBuyer1234567890abcdefABCDEF1234567",
  "issuer": "rXRPDomainsContractWallet123456789",
  "receiver": "rXRPDomainsContractWallet123456789",
  "amount": 60,
  "price": 60,
  "base_uri": "https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/",
  "network": "MAINNET",
  "uri": "",
  "url": "https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/alice.xrp",
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "payload_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "ismobile": false,
  "nftoken_id": "",
  "adapter": "x402",
  "extension": true,
  "refcode": "",
  "setPrimary": false,
  "isVerify": true,
  "payment_currency": "XRP"
}
```

## 7 · Complete sample request (RLUSD payment)

```json
POST https://xrpdomains.xyz/api/xrplnft/createOrder
Content-Type: application/json

{
  "domain": "alice.xrp",
  "payment_tx": "A1B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCDEF1234",
  "buyer": "rBuyer1234567890abcdefABCDEF1234567",
  "owner": "rBuyer1234567890abcdefABCDEF1234567",
  "issuer": "rXRPDomainsContractWallet123456789",
  "receiver": "rXRPDomainsContractWallet123456789",
  "amount": 30,
  "price": 60,
  "base_uri": "https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/",
  "network": "MAINNET",
  "uri": "",
  "url": "https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/alice.xrp",
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "payload_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "ismobile": false,
  "nftoken_id": "",
  "adapter": "x402",
  "extension": true,
  "refcode": "",
  "setPrimary": false,
  "isVerify": true,
  "payment_currency": "RLUSD",
  "locked_rate": 2.10,
  "locked_at": 1785745200,
  "locked_source": "coingecko",
  "rlusd_amount": "12.60",
  "rlusd_issuer": "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  "rlusd_currency_code": "524C555344000000000000000000000000000000"
}
```

---

## 8 · x402 flow — recommended agent sequence

```
1.  Agent receives user request:  "Register alice.xrp for me"
2.  GET /api/xrplnft/getAddress?domain=alice.xrp   → confirm still available
3.  GET /api/config/pricing.json                    → compute price for (alice, .xrp) = 60 XRP
4.  Compute contract wallet + build Payment tx
5.  Sign Payment via agent's wallet (or delegate to user via x402 402 challenge)
6.  Submit Payment to XRPL, wait for tesSUCCESS + validation (~5-8s)
7.  POST /api/xrplnft/createOrder  with full body + payment_tx hash
8.  Read response.data.offer_id  (or poll /api/xrplnft/getOrderbyDomain?domain=alice.xrp)
9.  Sign NFTokenAcceptOffer with buyer wallet → tesSUCCESS
10. GET /api/domains/add2Queue?domain=alice.xrp&price=60 $XRP&chain=XRPL&adapter=x402
    (fire-and-forget · Telegram admin notify · see §10)
11. Optional: POST /api/xrplnft/setPrimary if user opted-in (separate endpoint)
```

Steps 1-6 are the x402 payment challenge phase (client-side auth via HTTP 402). Steps 7-9 are the mint fulfillment phase (server-side coordination via this endpoint).

---

## 9 · Coordination checklist for BE team

Before MCP goes live with x402 flow, BE (C# team) should:

- [ ] **Accept new `adapter` values**: `"x402"` and `"mcp-x402"` — currently BE may reject unknown adapters, or log as WARN. Whitelist these.
- [ ] **Rate-limit `createOrder` per IP** if MCP is going to hit it programmatically at higher frequency than browsers.
- [ ] **Return machine-friendly error codes** in response (e.g. `error_code: "PAYMENT_NOT_FOUND" | "AMOUNT_MISMATCH" | "DOMAIN_TAKEN"`) so MCP can branch on them rather than parsing `msg` string.
- [ ] **Add `x402_receipt` optional field** if MCP wants to attach the x402 receipt hash (for auditability).
- [ ] **Confirm `platform_wallet` address** is publicly discoverable (already in `networks-mainnet.js`) so MCP doesn't have to hardcode it.

---

## 10 · Post-mint notification — `GET /api/domains/add2Queue`

**After** `createOrder` returns with `data.mint_tx !== ""` (mint confirmed), FE fires a fire-and-forget GET to `/api/domains/add2Queue`. This triggers a **Telegram notification to the platform admin** so ops know a new domain was registered.

**MCP must call this too** — without it, admin doesn't get notified about x402-driven registrations, breaking ops visibility.

### Endpoint

```
GET https://xrpdomains.xyz/api/domains/add2Queue?domain={domain}&price={amount} $XRP&chain=XRPL&adapter={adapter}
```

### Query params

| Param | Value | Notes |
|---|---|---|
| `domain` | fulldomain with TLD | Same as `createOrder.domain` — e.g. `"alice.xrp"` |
| `price` | `{amount} $XRP` | **String concatenation** — amount number + literal ` $XRP` suffix. Even RLUSD payments send " $XRP" today (FE has not been updated for currency-aware label). Recommend: for RLUSD send `"{rlusd_amount} $RLUSD"` — coordinate with admin who reads Telegram to accept new format. |
| `chain` | `"XRPL"` | Hard-coded on FE. Same value from MCP. |
| `adapter` | wallet adapter id | For MCP x402 use `"x402"` or `"mcp-x402"` — matches the `adapter` value sent to `createOrder`. |

### Timing

- Fire IMMEDIATELY after `createOrder` returns success with `mint_tx !== ""`
- **Fire-and-forget** — do NOT await response, do NOT block the NFTokenAcceptOffer step on this. If Telegram is down, admin misses a message but user's mint continues fine.
- No response parsing needed. Endpoint returns 200/empty even if Telegram delivery fails.

### Reference in FE code

From `v3/search.html:1558-1559`:

```js
var endpoint = '/api/domains/add2Queue?domain=' + domain
             + '&price=' + amount + ' $XRP&chain=XRPL&adapter=' + adapter;
doAjax(endpoint, '', 'GET');
```

### MCP-side implementation sketch

```js
// After createOrder success:
if (createOrderResp.data.mint_tx) {
    const url = new URL('https://xrpdomains.xyz/api/domains/add2Queue');
    url.searchParams.set('domain',  fulldomain);      // "alice.xrp"
    url.searchParams.set('price',   `${amount} $XRP`);
    url.searchParams.set('chain',   'XRPL');
    url.searchParams.set('adapter', 'x402');
    fetch(url.toString()).catch(() => { /* fire-and-forget */ });
}
```

### Coordination note for BE team

If BE adds RLUSD-aware pricing label later, extend `price` param to accept `"{amount} $RLUSD"` and have the Telegram formatter branch on the currency suffix. Right now hard-coded XRP label is intentional legacy behavior.

---

## 11 · Change log

| Date | Change |
|---|---|
| 2026-08-07 | Initial handoff extracted from `v3/search.html` `mintDomain()` code path. |
| 2026-08-07 | Fix: `domain` param is **fulldomain with TLD** (`"alice.xrp"`), not base name (`"alice"`).  Verified from `search.html:1379` where `mintDomain(fulldomain, ...)` is invoked.  Updated §2 table + both sample bodies §6/§7 + `url` field. |
| 2026-08-07 | Fix: `base_uri` correct value on mainnet is `"https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/"` (NFT metadata JSON endpoint) — NOT `"https://xrpdomains.xyz/name/"` (that's the human profile page URL, different thing).  Updated §2 `base_uri` + `url` rows and both sample bodies. |
| 2026-08-07 | Added §10 — post-mint `GET /api/domains/add2Queue` call for Telegram admin notification.  MCP MUST call this (fire-and-forget) after each successful mint so ops has parity visibility with FE-driven registrations.  Params: `domain` (fulldomain) · `price` (`"{amount} $XRP"` string) · `chain=XRPL` · `adapter=x402`.  Referenced from `search.html:1558-1559`. |
