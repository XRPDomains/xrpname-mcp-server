# XRPName MCP Server — Implementation Spec

> **Version:** 1.1 (Jun 12, 2026 — aligned with Phase 1 BE consolidation)
> **Status:** Draft — pending product sign-off
> **Target audience:** Backend engineer implementing the MCP server (standalone repo, separate codebase from the web app)
> **Estimated effort:** 2-3 weeks for MVP (Phase 1 + Phase 2)
>
> **Scope boundary (read first):** This spec is for a **new, standalone backend service**. It does NOT modify the existing web app at `xrpdomains.xyz` (`v3/` codebase). The MCP server lives at a separate origin (`mcp.xrpdomains.xyz`) and shares only the public REST API surface that the web app already consumes. No DB schema changes, no front-end changes, no shared code.

---

## 0. What changed in v1.1 (Jun 12, 2026)

Phase 1 BE consolidation đã ship 4 endpoint aggregator mới ở
`xrpdomains.xyz`. MCP server spec re-aligned để consume các endpoint
mới này thay vì các path cũ. Highlights:

| Tool | Before (per-call fan-out) | After (consolidated) |
|---|---|---|
| `check_domains` | N × `getAddress?domain=X` | N × `checkDomains?domain=X` (+ optional `getAddress` follow-up for registered) — batch contract pending BE |
| `get_portfolio` | `getBithompNFT?address` + `getName?address` + N × `getAddress` per-card verify | **1 × `getAllNames?address`** (paginated, sorted, keyword-searchable, `primary_domain` inline) |
| `get_pending_offers` | `getOfferByDestination` + `getOfferByOwner` + N × NFTokenID resolvers | **1 × `getPendingDomains?owner`** (mint + incoming + outgoing in 1 atomic snapshot) |
| `get_domain_profile` (`include_history=true`) | `getAddress` + `getBithompNFT?nftid` | **1 × `getAddress?domain&include=history`** |

API call counts cho 1 portfolio query 50 domains + 10 pending:
~52 BE calls → **2 BE calls** (96% reduction). Sản phẩm phụ:
- `get_pending_offers` giờ trả thêm `mint[]` (paid-not-minted orders) — agent có thể suggest "continue mint" actions
- `get_domain_profile` thêm `include_history` flag — agent trả lời "show me X.xrp history" trong 1 tool call
- Cache key scheme mới — bao gồm history variant key riêng + invalidation map theo tx type (xem §12.2)

Endpoints **removed from spec** (replaced by aggregator):
`getOrdersPending`, `getOfferByDestination`, `getOfferByOwner`,
`getOrderbyNFTokenId`, `getNFTsbyNFTokenId`, direct XRPL `account_nfts` WSS walk,
`/api/nftdomains/metadata/{domain}`.

Known BE follow-ups blocking full optimization:
- `checkDomains` batch contract (`?domain=A,B,C` → array) — MCP server currently fans out N parallel single-domain requests
- ETag + Cache-Control headers cho read-only endpoints (D — pending BE)

---

## Table of contents

0. What changed in v1.1 (Jun 12, 2026)
1. Strategic context + goal
2. What is MCP (Model Context Protocol)
3. Reference implementation — SNS (sns.id/agent)
4. High-level architecture
5. Repo structure
6. Tech stack + dependencies
7. Authentication + identity flow
8. Tool catalog (the full API surface)
9. XRPL transaction building patterns
10. Backend API contract (what MCP server calls)
11. Error handling + classification
12. Rate limiting + caching
13. Deployment + ops
14. Testing strategy
15. Implementation phases + acceptance criteria
16. Out of scope (explicit non-goals — anti-duplication with web v3)
17. Open questions for product
18. Appendix A — JSON schemas for all tool inputs/outputs
19. Appendix B — Example MCP session traces
20. Appendix C — XRPL transaction templates

---

## 1. Strategic context + goal

### 1.1 Why MCP

The Model Context Protocol is an open standard from Anthropic (2024) that lets any AI agent (Claude desktop, Claude Code, Cursor, ChatGPT custom GPTs that adopt MCP, future agents) discover and call tools on a remote server through a uniform protocol. The user types natural language; the agent picks which tool to call and with what arguments; the server returns structured JSON; the agent presents the result conversationally.

SNS (Solana Name Service) shipped `mcp.sns.id/mcp` and made the entire .sol registration / management flow available to any MCP-compatible agent. XRPName has the same opportunity for the XRPL ecosystem and should ship before competitors (XRP.cafe, XRPLDomains alt-implementations) do.

### 1.2 Goal of v1

Ship a stable, secure MCP server at `mcp.xrpdomains.xyz/mcp` that exposes 9 tools covering read + transaction-build + transaction-broadcast for `.xrp` / `.xrpfi` / `.xrpl` domains. Target experience:

```
User → Claude: "Is nftcafe.xrp available, and if not who owns it?"
Claude → mcp.xrpdomains.xyz: check_domains({domains: ["nftcafe.xrp"]})
Claude → User: "nftcafe.xrp is taken by rU4K6n…Kokx. Want me to suggest 5 similar available domains?"

User: "Yes, and register one for me with my refcode 9A22A"
Claude → check_domains for 5 names → register_domain_tx → returns unsigned XRPL tx blob + web fallback URL
Claude → User: "Here is the signing URL: xrpdomains.xyz/search?prefill=…&refcode=9A22A"
```

### 1.3 Non-goal — what this server does NOT do

- It does NOT sign transactions. The user signs in their own wallet. The MCP server never sees a private key.
- It does NOT replace the web app. Users without an agent still go to `xrpdomains.xyz`.
- It does NOT mutate the existing backend DB schema beyond what `/api/auth/signIn` and `/api/xrplnft/createOrder` already do.
- It does NOT host an LLM. The agent (Claude / GPT) runs on the user's side.

---

## 2. What is MCP

A 60-second primer for the implementer:

- **Protocol:** JSON-RPC 2.0 over HTTP or stdio. v1.0 transport that matters for us: **HTTP streaming** (long-lived POST for `tools/call`, optional SSE for `notifications`).
- **Discovery:** client connects → calls `initialize` → calls `tools/list` → server returns array of tool definitions (name, description, JSON schema for input).
- **Invocation:** client calls `tools/call` with `{name, arguments}` → server returns `{content: [{type, text|data}]}` or `isError: true` with error content.
- **Authentication:** OAuth 2.1 with PKCE. MCP spec defines auth challenges; the server returns `401 Unauthorized` with `WWW-Authenticate` headers; client redirects user to OAuth flow; user logs in via wallet signature (see §7).

Key reference docs:
- Spec: <https://modelcontextprotocol.io/specification>
- TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
- Python SDK: <https://github.com/modelcontextprotocol/python-sdk>

We will use the **TypeScript SDK** (matches Node.js backend choice).

---

## 3. Reference implementation — SNS

SNS for Agents (`sns.id/agent`) is the closest analog. Their MCP server exposes 8 tools across 4 categories. Their patterns we should mirror:

| Pattern | How SNS does it | Our implementation |
|---|---|---|
| Tool naming | snake_case with mode suffix: `check_domains` (read), `register_domain_tx` (tx-build), `send_signed_tx` (write) | Same convention |
| Server-builds, user-signs | `register_domain_tx` returns base58 + base64 of unsigned Solana tx | We return XRPL tx in JSON + hex; user signs in wallet kit; `send_signed_tx` broadcasts to XRPL |
| Web fallback in every TX response | Every `*_tx` tool returns `web_register_url` | Same — every TX tool returns `web_url` pointing at `xrpdomains.xyz` with prefill params |
| Multi-domain batch reads | `check_domains` accepts 1-25 names | Same cap, same shape |
| Tool descriptions are agent-friendly | "Use for questions like 'is X.sol taken?'" | Embed natural-language hints in tool descriptions so the LLM routes correctly |
| OAuth on first use | Browser-based auth, server caches token | Same — wallet-signature-based OAuth (§7) |

What we add that SNS doesn't have:
- `get_pending_offers` — XRPL native incoming/outgoing NFToken offers (SNS doesn't have an equivalent)
- `transfer_domain_tx` + `accept_offer_tx` + `cancel_offer_tx` — full bidirectional transfer flow
- `burn_domain_tx` — destroy NFT
- `subname_*` tools (Phase 3) — XRPName supports subnames, SNS does not

---

## 4. High-level architecture

```
                 ┌─────────────────────────────────────┐
                 │  User's machine                     │
                 │  ┌──────────────┐  ┌─────────────┐ │
                 │  │ Claude       │  │ Wallet      │ │
                 │  │ Desktop /    │  │ (Xaman /    │ │
                 │  │ Cursor /     │  │  Gem /      │ │
                 │  │ Custom GPT   │  │  Crossmark) │ │
                 │  └──────┬───────┘  └──────┬──────┘ │
                 └─────────┼─────────────────┼────────┘
                           │ MCP             │ signs
                           │ (HTTP)          │ XRPL tx
                           ▼                 │
       ┌────────────────────────────────────┐│
       │   mcp.xrpdomains.xyz               ││
       │   ┌────────────────────────────┐   ││
       │   │  MCP HTTP transport        │   ││
       │   │  (JSON-RPC 2.0)            │   ││
       │   ├────────────────────────────┤   ││
       │   │  OAuth provider            │   ││
       │   │  (session ↔ XRPL address)  │   ││
       │   ├────────────────────────────┤   ││
       │   │  Tool dispatcher           │   ││
       │   │  ┌──────────┐ ┌─────────┐  │   ││
       │   │  │ Read     │ │ Tx-build│  │   ││
       │   │  │ tools    │ │ tools   │  │   ││
       │   │  └──────────┘ └─────────┘  │   ││
       │   │  ┌─────────────────────┐   │   ││
       │   │  │ XRPL submit + status│   │   ││
       │   │  └─────────────────────┘   │   ││
       │   └────────────────────────────┘   ││
       └─────────┬────────────┬─────────────┘│
                 │            │              │
                 ▼            ▼              ▼
     ┌────────────────┐  ┌──────────┐  ┌──────────────┐
     │ xrpdomains.xyz │  │ XRPL     │  │ User's wallet│
     │ /api/...       │  │ mainnet  │  │ (signs tx)   │
     │ (existing REST)│  │ public   │  │              │
     └────────────────┘  │ servers  │  └──────────────┘
                         └──────────┘
```

**Hard rules:**
- MCP server **only** calls publicly available endpoints on `xrpdomains.xyz` and the public XRPL JSON-RPC. No private DB access. No backdoor.
- The Bithomp auth token used internally by `xrpdomains.xyz` for `/api/xrplnft/getBithompNFT` stays on the web backend; MCP server proxies through the **public** `/api/xrplnft/getBithompNFT` endpoint just like the browser does.
- Signing happens entirely client-side. The MCP server never receives a seed, private key, or family seed.

---

## 5. Repo structure

**Recommendation:** new standalone repo `xrpname-mcp-server` on GitHub, **not** a folder inside the `XRPDomains` web monorepo.

Rationale:
- Different deployment lifecycle (web ships continuously; MCP server ships when tools change)
- Different runtime (web is HTML+jQuery+vanilla JS; MCP is Node.js + TypeScript)
- Different security surface (MCP has OAuth; web has wallet kit)
- Different observability needs
- Easier to open-source independently (if desired) without leaking web app internals

Proposed layout:

```
xrpname-mcp-server/
├── README.md
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .github/
│   └── workflows/
│       ├── ci.yml                 # typecheck + test + lint
│       └── deploy.yml             # build + push to registry
├── src/
│   ├── index.ts                   # entrypoint — boots HTTP server + MCP
│   ├── server.ts                  # MCP server setup, tool registration
│   ├── config.ts                  # env loader + validation
│   ├── auth/
│   │   ├── oauth-provider.ts      # OAuth 2.1 endpoints (/authorize, /token)
│   │   ├── session-store.ts       # Redis-backed session lookups
│   │   └── wallet-challenge.ts    # nonce + signature verification
│   ├── tools/
│   │   ├── index.ts               # exports all tool definitions
│   │   ├── check-domains.ts
│   │   ├── get-portfolio.ts
│   │   ├── get-domain-profile.ts
│   │   ├── get-pending-offers.ts
│   │   ├── register-domain-tx.ts
│   │   ├── transfer-domain-tx.ts
│   │   ├── accept-offer-tx.ts
│   │   ├── cancel-offer-tx.ts
│   │   ├── burn-domain-tx.ts
│   │   ├── set-primary-domain-tx.ts
│   │   ├── update-profile-record-tx.ts
│   │   ├── send-signed-tx.ts
│   │   └── check-tx-status.ts
│   ├── clients/
│   │   ├── xrpdomains-api.ts      # wrapper around xrpdomains.xyz REST
│   │   ├── xrpl-client.ts         # @xrpl/client wrapper
│   │   └── cache.ts               # Redis cache layer
│   ├── lib/
│   │   ├── domain-validator.ts    # normalises foo.xrp, foo.xrpfi, etc.
│   │   ├── tx-builder.ts          # XRPL tx envelope construction
│   │   ├── tx-encoder.ts          # base58 / base64 / hex encoding
│   │   ├── web-fallback-url.ts    # generates xrpdomains.xyz prefill URLs
│   │   └── errors.ts              # error classifier
│   └── types/
│       ├── domain.ts
│       ├── tx.ts
│       └── mcp-tool.ts
├── test/
│   ├── unit/
│   │   ├── domain-validator.test.ts
│   │   ├── tx-builder.test.ts
│   │   └── tools/*.test.ts
│   ├── integration/
│   │   ├── full-flow.test.ts
│   │   └── oauth.test.ts
│   └── fixtures/
│       └── *.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TOOL_REFERENCE.md
│   ├── OAUTH_FLOW.md
│   ├── DEPLOYMENT.md
│   └── CONTRIBUTING.md
└── scripts/
    ├── smoke-test.sh              # call all tools, assert basic shape
    └── dev-server.sh
```

---

## 6. Tech stack + dependencies

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Stable LTS, matches MCP TS SDK |
| Language | TypeScript 5.4+ strict | Matches SDK, catches schema drift |
| HTTP framework | Fastify | Faster than Express, native JSON schema validation |
| MCP SDK | `@modelcontextprotocol/sdk` (TypeScript) | Official Anthropic SDK |
| XRPL client | `xrpl` npm package | Same as web app — same network, same encoding |
| OAuth provider | `oauth4webapi` or hand-roll with `jsonwebtoken` | Need PKCE support |
| Session store | Redis (or KV equivalent) | Token + nonce caching |
| Cache | Redis with TTL | Bithomp / getAddress responses |
| Logging | `pino` (JSON structured) | Production-friendly, easy to ship to Datadog/Sentry |
| Testing | `vitest` | Fast, modern, native ESM |
| Lint | ESLint + Prettier | Standard |
| Container | Docker + docker-compose | Same as backend deploys |

`package.json` dependencies (rough):

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "fastify": "^4.27.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/rate-limit": "^9.0.0",
    "xrpl": "^4.6.0",
    "ioredis": "^5.4.0",
    "jsonwebtoken": "^9.0.0",
    "zod": "^3.23.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

---

## 7. Authentication + identity flow

### 7.1 The problem

An AI agent calling our MCP server needs to:
1. Identify which XRPL address the user controls (so `get_portfolio` returns the right wallet's domains)
2. Prove that identity without ever exposing a private key

### 7.2 The flow (OAuth 2.1 + wallet signature)

Mirrors what `xrpdomains.xyz` already does via `/api/auth/current` + `/api/auth/signIn`, wrapped in OAuth.

```
1. Agent calls tools/call → server checks Bearer token → 401 if missing
2. Agent redirects user to mcp.xrpdomains.xyz/authorize?client_id=...&redirect_uri=...&state=...&code_challenge=...
3. User lands in browser → connects wallet (reuse xrpdomains.xyz wallet kit flow on a dedicated /authorize page)
4. Browser fetches /api/auth/current → backend returns a nonce
5. Wallet signs nonce + domain ("Sign in to XRPName MCP")
6. Browser POSTs signature to mcp.xrpdomains.xyz/authorize/complete
7. Server verifies signature → mints authorization code → redirects to client redirect_uri?code=...&state=...
8. Agent exchanges code at /token endpoint → receives access_token (JWT) + refresh_token
9. Token contains { sub: <XRPL address>, scope: "domains" } — server uses it for all subsequent tool calls
```

### 7.3 Token lifecycle

- `access_token` JWT, 1 hour TTL, signed with HS256 (server-side secret) or RS256 (rotated key)
- `refresh_token` opaque, 30 days TTL, single-use, stored in Redis with binding to `sub`
- On `tools/call`, decode JWT → extract `sub` (XRPL address) → pass to tool handlers as `ctx.address`

### 7.4 Token revocation

- `/revoke` endpoint per OAuth spec
- User can `disconnect wallet` in xrpdomains.xyz → trigger server-side revoke of all tokens for that address

### 7.5 Scope model

Single scope `domains` for v1. Future scopes:
- `domains:read` — only READ tools allowed
- `domains:write` — READ + TX tools
- `marketplace:read` (Phase 4 when marketplace ships)

### 7.6 What MCP server gets per call

```ts
interface ToolContext {
  address: string;          // user's XRPL address from JWT sub
  scopes: string[];         // ['domains']
  refcode: string | null;   // optional referral code carried in token (from /authorize?refcode=)
  tokenJti: string;         // for audit logs
}
```

All tool handlers receive `(args, ctx)` and use `ctx.address` as the authenticated identity.

---

## 8. Tool catalog

12 tools across 5 categories. Tool **descriptions** must be written for the LLM, not for humans — they should contain natural-language hints about when to invoke.

### 8.1 Category — Discovery (1 tool)

#### `check_domains` (READ)

```ts
{
  name: 'check_domains',
  description:
    'Check 1 to 25 XRPL domains for registration status and cost. ' +
    'Use for questions like "is <name>.xrp taken?", "how much does <name>.xrp cost?", ' +
    '"who owns <name>.xrp?", or to verify availability before calling register_domain_tx. ' +
    'Accepts .xrp, .xrpfi, .xrpl TLDs. Returns availability, pricing, owner address, ' +
    'profile metadata if registered, and a web URL for the user to register if available. ' +
    'Also returns invalid_domains for inputs that fail validation (bad chars, wrong TLD).',
  inputSchema: {
    type: 'object',
    properties: {
      domains: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 25,
        description: 'List of domains to check. Each may include or omit the TLD; defaults to .xrp.'
      }
    },
    required: ['domains']
  }
}
```

Response shape:
```ts
{
  results: Array<{
    domain: string;                    // normalised, e.g. "nftcafe.xrp"
    available: boolean;
    price_xrp: number | null;          // null if not for sale (taken)
    owner: string | null;              // r... if taken
    nftoken_id: string | null;         // 64-char hex if taken
    profile: {                         // null if no profile or domain available
      fullname?: string;
      description?: string;
      avatar?: string;
      twitter?: string;
      website?: string;
    } | null;
    web_url: string;                   // either /search?prefill=... (available) or /name/{domain} (taken)
    length: number;
    tld: '.xrp' | '.xrpfi' | '.xrpl';
    is_subname: boolean;
  }>;
  invalid_domains: Array<{ input: string; reason: string }>;
}
```

Backend endpoint mapping (post Jun 12 BE consolidation):
- **Primary path:** For each domain → GET `/api/xrplnft/checkDomains?domain=<domain>` (E26)
  - Returns `{ data: [{ issuer, owner, domain, nftoken_id, status: "registered"|"available" }] }`
  - When `status: "registered"` and the tool needs full profile data, follow up with GET `/api/xrplnft/getAddress?domain=<domain>` (E1)
  - When `status: "available"`, no follow-up needed — only price + web_url
- **Note:** BE batch contract (`?domain=A,B,C` → array) chưa support — MCP server gọi N parallel requests (chunk 10 concurrent). Khi BE ship batch, đổi 1 dòng:
  ```
  GET /api/xrplnft/checkDomains?domain=A,B,C  → array response
  ```
- Cache responses 60s per domain at `mcp:checkDomain:<domain>` key
- Price calculation: existing pricing logic from `search.html` (length-based × 1 XRP / discount tiers)

### 8.2 Category — Portfolio (3 tools)

#### `get_portfolio` (READ)

```ts
{
  name: 'get_portfolio',
  description:
    'List all XRPL domains owned by a wallet address. ' +
    'Use when the user asks "what domains do I own?", "show me my domains", ' +
    'or wants to see another wallet\'s holdings. ' +
    'Returns domain name, nftoken_id, primary flag, length, TLD, and quick-action URLs. ' +
    'For the connected user, defaults to their own address; pass `address` to query another wallet.',
  inputSchema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'XRPL r... address. Omit to use the authenticated user.' },
      sort: { type: 'string', enum: ['length-asc', 'length-desc', 'name-asc', 'recent'], default: 'recent' },
      filter_tld: { type: 'string', enum: ['.xrp', '.xrpfi', '.xrpl', 'all'], default: 'all' },
      limit: { type: 'number', default: 50, maximum: 200 }
    }
  }
}
```

Response:
```ts
{
  address: string;
  total: number;
  primary_domain: string | null;
  domains: Array<{
    domain: string;
    nftoken_id: string;
    is_primary: boolean;
    length: number;
    tld: '.xrp' | '.xrpfi' | '.xrpl';
    is_subname: boolean;
    image_url: string | null;
    minted_at: number | null;          // unix seconds
    profile_url: string;               // xrpdomains.xyz/name/{domain}
    manage_url: string;                // xrpdomains.xyz/mydomains
  }>;
}
```

Backend mapping (post Jun 12 BE consolidation):
- GET `/api/xrplnft/getAllNames?address=<r…>&limit=<limit>&page=<n>[&keyword=<k>]` (E3 enriched)
- Single call returns: `{ data: [...], primary_domain, total, has_next, snapshot_at, page, total_pages }`
- **No more parallel `getName` call** — `primary_domain` is at the response root
- **No more Bithomp pass-through** — `getAllNames` does the issuer filter server-side
- Per-entry shape: `{ is_primary, nftoken_id, domain, owner, issuer, profile_url, metadata_url, metadata: { image, name, attributes[] }, create_at }`
- Tool `sort` param: nếu `recent` → backend đã sort sẵn (`is_primary` first → `create_at` DESC); các sort khác (length-asc, etc.) → MCP server sort client-side trên response array (đa số user <500 domains nên acceptable)
- `keyword` filter: forward sang BE qua `?keyword=` (substring match) khi caller cần lọc — đỡ tốn bandwidth so với fetch toàn bộ rồi filter ở MCP server
- Pagination: loop qua `has_next` cap 20 pages (10k domains safety) — giống FE v3-mydomains-list
- Cache 30s per address at `mcp:getAllNames:<address>:<page>:<keyword>` key

#### `get_pending_offers` (READ)

```ts
{
  name: 'get_pending_offers',
  description:
    'Get all pending XRPL NFToken offers for a wallet — both incoming (someone offered the wallet a domain) ' +
    'and outgoing (the wallet listed a domain for transfer). ' +
    'Use when the user asks "do I have any pending transfers?", "what offers are waiting on me?", ' +
    'or before suggesting accept_offer_tx / cancel_offer_tx.',
  inputSchema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'XRPL address. Omit to use the authenticated user.' }
    }
  }
}
```

Response:
```ts
{
  address: string;
  mint: Array<{ domain, nftoken_id: string|null, payment_tx, status, created_at }>;
  incoming: Array<{ domain, nftoken_id, offer_id, sender, amount_drops, expiration, created_at }>;
  outgoing: Array<{ domain, nftoken_id, offer_id, destination, amount_drops, expiration, created_at }>;
  counts: { mint: number; incoming: number; outgoing: number; total: number };
}
```

> **Note (Jun 12):** Added `mint[]` array — was missing in v1 spec. BE
> consolidator returns paid-but-not-minted orders too, so MCP exposes
> them. Agents can suggest "continue mint" actions for these (no
> separate offer_id required — mint flow uses `payment_tx`).

Backend mapping (post Jun 12 BE consolidation):
- **Single call:** GET `/api/xrplnft/getPendingDomains?owner=<r…>` (E25)
- Returns `{ data: { mint[], incoming[], outgoing[], counts } }` — atomic snapshot, no race between 3 separate endpoints
- Field name mapping BE → tool response:
  - `incoming[].owner` (NFT owner who sent the offer) → tool `sender`
  - `incoming[].amount` (string "0") → tool `amount_drops` (keep as string for precision)
  - `outgoing[].destination` (intended recipient) → tool `destination`
- Replaces legacy E7 + E8 + E9 + N×(E4/E5/E6) — 3+5N calls → 1 call
- Cache 10s at `mcp:getPendingDomains:<address>` key
- Invalidate after `send_signed_tx` success when tx is `NFTokenAcceptOffer`, `NFTokenCancelOffer`, or `NFTokenCreateOffer`

#### `get_domain_profile` (READ)

```ts
{
  name: 'get_domain_profile',
  description:
    'Get the full public profile of a single XRPL domain — owner, NFT token ID, metadata, ' +
    'avatar, fullname, description, social handles, linked chain addresses, and (optionally) ' +
    'on-chain ownership history. ' +
    'Use when the user asks "show me X.xrp", "what does X.xrp link to?", "who owns X.xrp?", ' +
    'or "show me the history of X.xrp". Pass include_history=true to get the timeline. ' +
    'Returns null fields gracefully if the domain has no profile set.',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domain to look up, e.g. "alice.xrp"' },
      include_history: {
        type: 'boolean',
        default: false,
        description: 'Include on-chain ownership transfer + sale history (mint, claim, sale, transfer events).'
      }
    },
    required: ['domain']
  }
}
```

Response:
```ts
{
  domain: string;
  exists: boolean;
  owner: string | null;
  nftoken_id: string | null;
  profile: {
    fullname?: string;
    description?: string;
    avatar?: string;
    cover?: string;
    twitter?: string;
    facebook?: string;
    telegram?: string;
    discord?: string;
    github?: string;
    website?: string;
    email?: string;
    location?: string;
  } | null;
  addresses: Array<{ symbol: string; name: string; address: string; verified: boolean }> | null;
  history?: Array<{                       // only when include_history=true
    owner: string;
    changedAt: number;                    // unix seconds
    txHash: string;
    amount_drops: string;                 // "0" for transfer; >0 for sale
    marketplace?: string;
    ownerDetails?: { username?: string; service?: string };
  }>;
  profile_url: string;                    // xrpdomains.xyz/name/{domain}
}
```

Backend mapping (post Jun 12 BE consolidation):
- **Without history:** GET `/api/xrplnft/getAddress?domain=<domain>` (E1) — cache 60s at `mcp:getAddress:<domain>`
- **With history:** GET `/api/xrplnft/getAddress?domain=<domain>&include=history` (E1 + H flag) — 1 call returns both profile + history merged. Cache 60s at `mcp:getAddress:<domain>:history` (separate key vì payload to hơn nhiều)
- **No more separate Bithomp call** — replaces the 2-call (E1 + E10) flow with 1 call. Only fall back to `getBithompNFT?nftid=...` if domain → address resolution fails (rare).
- BE field rename note: `profile_uri` đã đổi thành `profile_url` Jun 12 — tool đọc field mới.

### 8.3 Category — Domains (6 transaction-build tools)

All `*_tx` tools follow the same pattern:
1. Validate input
2. Construct an XRPL transaction JSON (NOT signed)
3. Return: `{ tx_json, tx_hex_blob, web_url, instructions }`

#### `register_domain_tx` (TX)

```ts
{
  name: 'register_domain_tx',
  description:
    'Build an unsigned XRPL Payment transaction to register a .xrp / .xrpfi / .xrpl domain. ' +
    'Use after confirming availability with check_domains. ' +
    'This tool does NOT sign or broadcast. The buyer signs in their wallet and submits via send_signed_tx ' +
    'OR opens the returned web_url to complete in browser. ' +
    'Pass refcode if a referral applies. Pricing follows xrpdomains.xyz tiers.',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      buyer_address: { type: 'string', description: 'XRPL r... address that will own the domain' },
      payment_token: { type: 'string', enum: ['XRP'], default: 'XRP' },
      refcode: { type: 'string', description: 'Optional referral code' },
      set_as_primary: { type: 'boolean', default: false }
    },
    required: ['domain', 'buyer_address']
  }
}
```

Response:
```ts
{
  domain: string;
  buyer_address: string;
  price_xrp: number;
  fee_drops: string;
  tx_json: {
    TransactionType: 'Payment';
    Account: string;
    Destination: string;                // xrpdomains.xyz treasury address from networks-mainnet.js
    Amount: string;                     // price in drops
    Memos: Array<{ Memo: { MemoData: string; MemoType?: string } }>;
    Fee: string;
  };
  tx_hex_blob: string;                  // for wallets that prefer pre-encoded
  web_url: string;                      // https://xrpdomains.xyz/search?prefill=foo.xrp&refcode=...
  instructions: string;                 // "Open web_url, or paste tx_hex_blob into your wallet, then call send_signed_tx with the signed result"
}
```

Critical: this MUST match the existing `createOrder` payment flow. See search.html L840-1130 and the upstream backend createOrder spec. The Memo carries domain + refcode + discount; the Destination is the treasury; the Amount is price in drops; the backend listens for this Payment and mints the NFT.

Note: createOrder needs to be called by the backend FIRST to register the order in DB. The MCP server should:
1. POST to `/api/xrplnft/createOrder` with `{ domain, owner: buyer_address, refcode, setPrimary, ... }`
2. Get back `order_id` + payment details
3. Build the Payment tx referencing the order
4. Return to agent

#### `transfer_domain_tx` (TX)

```ts
{
  name: 'transfer_domain_tx',
  description:
    'Build an unsigned XRPL NFTokenCreateOffer transaction (sell offer) to transfer a domain to another wallet. ' +
    'The recipient must accept via accept_offer_tx or via the xrpdomains.xyz pending banner. ' +
    'Use when the user says "send X.xrp to Y" or "transfer X.xrp to <address-or-domain>".',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      destination: { type: 'string', description: 'Either an XRPL r... address or another .xrp domain' }
    },
    required: ['domain', 'destination']
  }
}
```

Response:
```ts
{
  domain: string;
  nftoken_id: string;
  destination_address: string;          // resolved if input was a domain
  destination_input: string;            // original input
  tx_json: {
    TransactionType: 'NFTokenCreateOffer';
    Account: string;                    // owner
    NFTokenID: string;
    Amount: '0';
    Destination: string;
    Flags: 1;                           // tfSellNFToken
  };
  walletPayload: object;                // camelCase variant for Gem (see V3NftTx.buildTransfer)
  method_hint: 'createNFTOffer';
  tx_hex_blob: string;
  web_url: string;
  instructions: string;
}
```

Mirrors `V3NftTx.buildTransfer` from the web app — same XRPL shape, same Gem-compat payload.

#### `accept_offer_tx` (TX)

NFTokenAcceptOffer. Accept incoming offer.

#### `cancel_offer_tx` (TX)

NFTokenCancelOffer. Cancel outgoing offer (own offer).

#### `burn_domain_tx` (TX)

NFTokenBurn. Destroys NFT. Should include a strong warning in the response `instructions` field.

#### `set_primary_domain_tx` (TX)

Sets primary domain. This calls backend `/api/xrplnft/setPrimary` (which requires auth) + may include an XRPL memo proof depending on current backend implementation. Verify with backend team.

### 8.4 Category — Records (1 tool, Phase 3)

#### `update_profile_record_tx` (TX)

Update profile fields (twitter, bio, avatar URL, linked addresses). Backend `/api/profile/updateInfo` requires server-side auth, so this tool needs:
- The user's authenticated session token (already present via MCP OAuth)
- An XRPL memo proof so the backend can verify the wallet authorised the change

Defer to Phase 3 until the backend confirms its update-info auth scheme works for non-browser clients.

### 8.5 Category — Transactions (2 tools)

#### `send_signed_tx` (WRITE)

```ts
{
  name: 'send_signed_tx',
  description:
    'Broadcast a signed XRPL transaction blob to the network. ' +
    'Use after the user signs an unsigned transaction produced by any *_tx tool. ' +
    'Returns the transaction hash and broadcast result. ' +
    'Caller should then poll check_tx_status to confirm on-ledger validation.',
  inputSchema: {
    type: 'object',
    properties: {
      signed_tx_blob: { type: 'string', description: 'Hex-encoded signed XRPL transaction' }
    },
    required: ['signed_tx_blob']
  }
}
```

Backend mapping: `xrpl` npm client `submit(blob)`. Validate blob shape before submit. Return `{ tx_hash, engineResult, broadcast_at }`.

#### `check_tx_status` (READ)

```ts
{
  name: 'check_tx_status',
  description:
    'Check the validation status of an XRPL transaction by hash. ' +
    'Use after send_signed_tx to confirm whether the transaction was validated on-ledger. ' +
    'Returns status (pending, validated, failed) and engine result code.',
  inputSchema: {
    type: 'object',
    properties: {
      tx_hash: { type: 'string', pattern: '^[A-F0-9]{64}$' }
    },
    required: ['tx_hash']
  }
}
```

Backend mapping: `xrpl` client `request({ command: 'tx', transaction: tx_hash })`.

---

## 9. XRPL transaction building patterns

### 9.1 Source of truth — `v3/js/v3-nft-tx.js`

The web app already encapsulates correct XRPL transaction construction in `V3NftTx.buildTransfer` and `V3NftTx.buildBurn`. The MCP server should re-implement these in TypeScript with **identical** output shapes. Keeping them identical lets future-you do parity testing across both clients.

### 9.2 Gem wallet compatibility

Gem expects camelCase `walletPayload` for `createNFTOffer` calls; standard XRPL clients accept PascalCase `txJson`. The MCP server returns BOTH so the user's wallet (whatever it is) can pick. Same pattern as web.

### 9.3 Fees

Fixed 12 drops standard. Pull from a shared constant `XRPL.FEE_DROPS = '12'`. Match `V3.Const.xrpl.feeDrops` from web.

### 9.4 Memos

Encode strings to hex via `XRPL.convertStringToHex` equivalent in `xrpl` npm. Three memo slots used by createOrder:
1. `MemoData` = hex(fulldomain)
2. `Memos[1].MemoData` = hex(refcode)
3. `Memos[2].MemoData` = hex(discount value)

Verify exact memo layout with backend.

### 9.5 Treasury address

The XRPL address that receives registration Payment txns. Currently lives in `v3/networks-mainnet.js`. Mirror via env var: `XRPDOMAINS_TREASURY_ADDRESS=raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9`.

### 9.6 Encoding helpers

Returns provided in three encodings per `*_tx` response:
- `tx_json` — structured object, easiest for some wallets
- `tx_hex_blob` — pre-encoded, paste into any XRPL signer
- `walletPayload` — Gem-shape variant

Use `xrpl.encode` and `xrpl.encodeForSigning` from npm `xrpl`.

---

## 10. Backend API contract (what MCP server calls)

The MCP server is a **pure consumer** of the existing `xrpdomains.xyz` REST API. It does not need new endpoints in v1 (with one exception, see §10.2).

### 10.1 Existing endpoints used (post Jun 12 BE consolidation)

| Endpoint | Used by tool | Cache TTL | Notes |
|---|---|---|---|
| `GET /api/xrplnft/getAddress?domain=...` | get_domain_profile (no history), check_domains (registered follow-up) | 60s | E1 base mode |
| `GET /api/xrplnft/getAddress?domain=...&include=history` | get_domain_profile (with history) | 60s | E1 + H flag — replaces separate Bithomp call |
| `GET /api/xrplnft/checkDomains?domain=...` | check_domains | 60s | E26 — single domain mode (batch contract TBD by BE) |
| `GET /api/xrplnft/getAllNames?address=...&limit=&page=&keyword=` | get_portfolio | 30s | E3 — sorted (is_primary first), paginated, optional keyword |
| `GET /api/xrplnft/getPendingDomains?owner=...` | get_pending_offers | 10s | E25 — mint + incoming + outgoing in 1 call |
| `GET /api/xrplnft/getName?address=...` | (no longer needed for portfolio — `getAllNames` returns `primary_domain` at root) | 60s | Reserved for reverse lookups only |
| `GET /api/xrplnft/getBithompNFT?nftid=...` | (fallback only — when domain→address resolve fails) | 60s | E10 deprecated path — keep for safety net |
| `POST /api/xrplnft/createOrder` | register_domain_tx | — | |
| `POST /api/xrplnft/setPrimary` | set_primary_domain_tx | — | |
| `POST /api/auth/current` | OAuth nonce | — | |
| `POST /api/auth/signIn` | OAuth signature verification | — | |
| `POST /api/profile/updateInfo` | update_profile_record_tx (Phase 3) | — | |

**Legacy endpoints NOT used (replaced by E25/E3):**
- ❌ `/api/xrplnft/getOrdersPending` → E25
- ❌ `/api/xrplnft/getOfferByDestination` → E25
- ❌ `/api/xrplnft/getOfferByOwner` → E25
- ❌ `/api/xrplnft/getOrderbyNFTokenId` (resolver) → E25 returns domain inline
- ❌ `/api/xrplnft/getNFTsbyNFTokenId` (resolver) → E25 returns domain inline
- ❌ Direct XRPL `account_nfts` WSS walk → E3 with backend issuer filter
- ❌ `/api/nftdomains/metadata/{domain}` (E16) → use E1 `data.metadata` instead

**Total API call savings for MCP tool flows:**

| Tool | Before consolidation | After (Jun 12) |
|---|---|---|
| `check_domains` (N=25) | 25 × getAddress | 25 × checkDomains (smaller payload when available) + 0..M × getAddress follow-up cho registered domains |
| `get_portfolio` (N=50 domains) | 1 × getBithompNFT + 1 × getName + ~50 × E1 verify | **1 × getAllNames** |
| `get_pending_offers` (10 pending) | E7 + E8 + E9 + ~50 × resolver | **1 × getPendingDomains** |
| `get_domain_profile` with history | 1 × getAddress + 1 × getBithompNFT | **1 × getAddress?include=history** |

### 10.2 New endpoints needed

1. `POST /api/refcode/validateCode?code=ABC` — quick existence check for refcode validity before embedding it in a transaction. Phase 1 can skip this — agent passes refcode through, backend rejects at createOrder time if invalid.
2. `GET /api/xrplnft/checkDomains?domain=A,B,C` (batch contract) — current single-domain mode forces MCP server to fan out N requests. Batch would let `check_domains(domains=[25])` collapse to 1 request. BE Status: pending.

### 10.3 Auth headers

Reuse the cookie-based session model. The MCP server maintains a server-side session with `xrpdomains.xyz` per user, using the same `/api/auth/signIn` flow the browser uses. Cookie storage in Redis keyed by `mcp_session:<jti>`.

For server-to-server proxying, no auth header is needed for read-only endpoints.

---

## 11. Error handling + classification

### 11.1 MCP-level errors

Return `{ isError: true, content: [{ type: 'text', text: '<message>' }] }` for tool-call failures. The LLM will present the message to the user.

### 11.2 Error categories

| Code | When | User-facing message |
|---|---|---|
| `INVALID_INPUT` | Schema validation fails | "Domain '<x>' is not valid — must end in .xrp, .xrpfi, or .xrpl" |
| `DOMAIN_NOT_FOUND` | Lookup returns null | "Domain '<x>.xrp' isn't registered" |
| `INSUFFICIENT_BALANCE` | Reserve check fails | "Wallet needs at least <X> XRP available (current available: <Y>)" |
| `OFFER_NOT_FOUND` | Offer ID doesn't exist | "Pending offer not found — it may have expired or already been processed" |
| `WALLET_NOT_AUTHENTICATED` | No valid session | "Please authenticate first by visiting <auth_url>" |
| `RATE_LIMITED` | Per-user rate hit | "Too many requests — try again in <N> seconds" |
| `BACKEND_UNAVAILABLE` | xrpdomains.xyz 5xx | "XRPName is temporarily unavailable. Please try again in a minute." |
| `XRPL_NETWORK_ERROR` | XRPL submit fails | "Network error broadcasting transaction. The transaction was not submitted." |
| `LEDGER_REJECTED` | tx returns non-tesSUCCESS | "Transaction rejected by the XRPL ledger: <engine_result>" |

### 11.3 Logging

Every error logs:
- Request ID
- User address (if authenticated)
- Tool name
- Args (with PII redacted — never log refcode if backend says it's secret)
- Error code + stack

Stream to stdout in JSON (pino) → ship to log aggregator.

---

## 12. Rate limiting + caching

### 12.1 Rate limits

Per authenticated address:
- READ tools: 60 calls / minute
- TX-build tools: 20 calls / minute
- WRITE (send_signed_tx): 10 calls / minute

Per unauthenticated (only `check_domains` allowed unauthenticated): 30 calls / minute per IP.

Implementation: `@fastify/rate-limit` with Redis backend.

### 12.2 Caching

Match the web app's `V3.ApiCache` pattern but server-side in Redis:

| Cache key prefix | Source | TTL |
|---|---|---|
| `mcp:getAddress:<domain>` | E1 (no history) | 60s |
| `mcp:getAddress:<domain>:history` | E1 with `?include=history` (separate key — bigger payload) | 60s |
| `mcp:checkDomain:<domain>` | E26 single-domain response | 60s |
| `mcp:getName:<address>` | E2 response (reverse lookup only) | 60s |
| `mcp:getAllNames:<address>:<page>:<keyword>` | E3 paginated response — keyword normalized to lowercase, empty if absent | 30s |
| `mcp:getPendingDomains:<address>` | E25 aggregated response | 10s |

Cache invalidation on tx success — when `send_signed_tx` returns success, invalidate any cache key that may have changed:

| Tx type | Invalidate prefixes |
|---|---|
| `Payment` (mint) | `mcp:getAllNames:<buyer>`, `mcp:getPendingDomains:<buyer>` |
| `NFTokenCreateOffer` | `mcp:getPendingDomains:<seller>`, `mcp:getPendingDomains:<recipient>` |
| `NFTokenAcceptOffer` | `mcp:getAllNames:<buyer>`, `mcp:getAllNames:<seller>`, `mcp:getPendingDomains:<buyer>`, `mcp:getPendingDomains:<seller>`, `mcp:getAddress:<domain>*` (both keys) |
| `NFTokenCancelOffer` | `mcp:getPendingDomains:<owner>`, `mcp:getPendingDomains:<destination>` |
| `NFTokenBurn` | `mcp:getAllNames:<owner>`, `mcp:getAddress:<domain>*` |
| `setPrimary` (POST) | `mcp:getAllNames:<owner>` (primary_domain field changes), `mcp:getName:<owner>` |

---

## 13. Deployment + ops

### 13.1 Hosting

- Container image deployed to whatever platform `xrpdomains.xyz` backend already runs on
- DNS: `mcp.xrpdomains.xyz` → load balancer → MCP server pods
- TLS via Cloudflare or Let's Encrypt
- Min 2 pods for HA; autoscale based on RPS

### 13.2 Required env vars

```
XRPDOMAINS_API_BASE=https://xrpdomains.xyz
XRPDOMAINS_TREASURY_ADDRESS=raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9
XRPL_WSS_URL=wss://xrplcluster.com
REDIS_URL=redis://...
OAUTH_JWT_SECRET=<32-byte hex>
OAUTH_ISSUER=https://mcp.xrpdomains.xyz
LOG_LEVEL=info
PORT=3000
```

`.env.example` ships in repo; secrets injected by deployment platform.

### 13.3 Health endpoints

- `GET /health` → 200 if Redis + XRPL client both reachable
- `GET /ready` → 200 if last 5 check_domains calls succeeded (for load balancer drain)
- `GET /metrics` → Prometheus format (request counts, latencies, cache hit rate, XRPL submit success rate)

### 13.4 Observability

- Logs → JSON to stdout, scraped by platform (Datadog, Logtail, etc.)
- Metrics → Prometheus
- Tracing → OpenTelemetry (optional v1, recommended v1.5)
- Alerts:
  - p95 latency > 2s for 5 min
  - 5xx rate > 1% for 5 min
  - Redis connection lost
  - XRPL submit failure rate > 10%

### 13.5 Secret management

Never commit secrets. Backend team should provision:
- A dedicated service account on backend for the MCP server (auth header rate-limited differently from end-user)
- An OAuth signing key, rotated yearly

---

## 14. Testing strategy

### 14.1 Unit tests (fast, mocked)

- Domain validator: edge cases like uppercase, trailing dots, emojis, sub-name dotted (`mail.alice.xrp`)
- Tx builder: shape matches `xrpl` npm encoding round-trip
- Cache: TTL respected, invalidation works
- Web fallback URL: encodes refcode + prefill correctly

### 14.2 Integration tests (against real backend, testnet XRPL)

- Full register flow: check_domains → register_domain_tx → manual sign (with testnet wallet) → send_signed_tx → check_tx_status
- Full transfer flow: transfer_domain_tx → recipient accept_offer_tx → both sign → status confirmed
- OAuth roundtrip: authorize → signature → token → tool call

### 14.3 MCP protocol conformance

- `tools/list` returns 12 tools
- `initialize` handshake completes
- Auth challenge (`401` with WWW-Authenticate) on missing token

Use Anthropic's MCP inspector tool for manual conformance.

### 14.4 Load test

- `check_domains` with 25 domains × 100 concurrent users → p95 < 1s
- `get_portfolio` × 1000 RPS → cache should keep backend RPS < 50

### 14.5 Smoke script

`scripts/smoke-test.sh` calls every tool once with safe args (no real registration). CI runs on every PR.

---

## 15. Implementation phases + acceptance criteria

### Phase 1 — MVP (Week 1-2)

Ship:
- OAuth flow end-to-end
- 5 read tools: `check_domains`, `get_portfolio`, `get_pending_offers`, `get_domain_profile`, `check_tx_status`
- 1 write tool: `send_signed_tx`
- Caching + rate limiting
- Health endpoints
- Smoke tests
- Deploy to staging `mcp-staging.xrpdomains.xyz`

Acceptance criteria:
- `tools/list` returns 6 tools with correct schemas
- Auth flow completes in under 30s on a fresh wallet
- `check_domains` with 25 domains returns in < 1.5s (cached) or < 4s (cold)
- `get_portfolio` returns identical domain set to what mydomains.html shows for the same address
- `send_signed_tx` successfully broadcasts a transfer tx on testnet and `check_tx_status` reports validated
- p95 latency on any read tool < 1.5s in load test

### Phase 2 — Transactions (Week 3)

Ship:
- 4 tx-build tools: `transfer_domain_tx`, `accept_offer_tx`, `cancel_offer_tx`, `burn_domain_tx`
- Cache invalidation on tx success
- Web fallback URLs for every tx tool

Acceptance criteria:
- All 4 tx tools produce txns that XRPL testnet accepts when signed
- Web fallback URL opens xrpdomains.xyz with all params pre-filled
- Cache invalidation logged on every successful send_signed_tx

### Phase 3 — Records + registration (Week 4)

Ship:
- `register_domain_tx`
- `set_primary_domain_tx`
- `update_profile_record_tx`
- Deprecate `mcp-staging` → promote to `mcp.xrpdomains.xyz`

Acceptance criteria:
- Full registration via Claude completes: ask Claude → Claude calls register_domain_tx → user signs in wallet → Claude calls send_signed_tx → domain appears in user's portfolio within 30s
- `update_profile_record_tx` successfully updates twitter handle and is reflected in subsequent `get_domain_profile` call

### Phase 4 — Launch (Week 5)

Ship:
- Landing page `xrpdomains.xyz/agent` (mirror sns.id/agent layout)
- Docs at `docs.xrpdomains.xyz/mcp` (or in repo)
- Setup-guide cards per client (Claude Desktop, Cursor, Claude Code, Custom GPT)
- Launch blog post + tweet thread

Acceptance criteria:
- Landing page passes Lighthouse score 95+
- `claude mcp add xrpname --transport http https://mcp.xrpdomains.xyz/mcp` works on Claude Code 1.0+
- First 10 successful end-to-end registrations from MCP traffic (not browser) logged

---

## 16. Out of scope — explicit non-goals

To prevent accidental duplication with the existing web app and to keep this MVP shippable, the following are **NOT** in scope:

| Out of scope | Why |
|---|---|
| Modifying any file under `XRPDomains/v3/` | MCP server is a standalone codebase; web app continues evolving in parallel |
| Modifying backend DB schema | MCP server is a pure REST/XRPL consumer; no schema changes |
| Subname management (create/burn subnames) | Phase 5+, after MVP traction proven |
| Marketplace tools (list, buy, accept offer with price) | Marketplace feature itself isn't shipped yet on web — MCP will follow once web does |
| Notifications (server pushes domain-received alerts to agent) | MCP spec supports notifications but adds infra; defer until Phase 2 ships |
| Multi-wallet management per token (one OAuth session = one address) | Common pattern; revisit when users complain |
| Front-end customizations of xrpdomains.xyz to handle MCP-launched URLs | Existing /search?prefill=... should already work; verify and document, don't change |
| Replacing the web app's wallet kit with an agent-only flow | Web wallet kit stays the source of truth for browser users |
| Implementing a public discovery API outside MCP | If non-MCP clients want JSON, they use the existing REST API |
| Custom domain pricing or rule changes | All pricing follows existing backend logic; MCP just queries |
| Modifying the existing `getAddress` / `getName` response shapes | MCP server adapts to whatever the backend returns today |

---

## 17. Open questions for product

Before kickoff, product owner must answer:

1. **OAuth client model.** Public client (PKCE, no secret) is friendlier for desktop apps. Private clients (client_secret) are safer for server-to-server. Recommend public + PKCE for v1. Confirm?
2. **Treasury address per env.** Mainnet treasury is `raAyaz…1q9`. Is there a testnet treasury we can use during dev? If not, dev runs against mainnet read-only and skips registration tests.
3. **Refcode validation.** Should MCP server validate refcode existence before embedding (requires new backend endpoint), or rely on createOrder to reject? Recommend latter for v1.
4. **Rate limit policy.** Suggested limits in §12.1 — are they aligned with backend capacity? Backend lead to confirm.
5. **Pricing logic location.** Currently lives in `search.html` inline JS. Should it be extracted to a backend endpoint `/api/xrplnft/price?domain=...` so both web and MCP read from one place? Recommend yes; backend team to scope.
6. **Branding.** "XRPName MCP" or "XRPDomains MCP"? Spec uses XRPName for consistency with sns.id/agent style; confirm.
7. **OAuth landing page UX.** Reuse the existing wallet kit on a dedicated `/authorize` page, or build a stripped-down OAuth-only signing UI? Recommend the former for code reuse.
8. **What happens when MCP server is offline?** Web continues working — confirm no implicit dependency.

---

## 18. Appendix A — JSON schemas for all tool inputs/outputs

(Inline above per tool. Full machine-readable schemas live in `src/tools/<tool>.ts` `inputSchema` properties. Generate `tools.json` artifact for docs site.)

---

## 19. Appendix B — Example MCP session traces

### B.1 Successful registration

```
User: "Register cooldomain.xrp for me"

[Agent → MCP]
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "check_domains",
    "arguments": { "domains": ["cooldomain.xrp"] }
  }
}

[MCP → Agent]
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "..." }],
    "structuredContent": {
      "results": [{ "domain": "cooldomain.xrp", "available": true, "price_xrp": 1, ... }],
      "invalid_domains": []
    }
  }
}

[Agent → User] "cooldomain.xrp is available for 1 XRP. Should I prepare the registration?"
[User] "Yes"

[Agent → MCP]
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "register_domain_tx",
    "arguments": {
      "domain": "cooldomain.xrp",
      "buyer_address": "rUserAddress...",
      "set_as_primary": false
    }
  }
}

[MCP → Agent]
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "structuredContent": {
      "domain": "cooldomain.xrp",
      "price_xrp": 1,
      "tx_json": { ... },
      "tx_hex_blob": "1200002280000000...",
      "web_url": "https://xrpdomains.xyz/search?prefill=cooldomain.xrp&order=ord_abc123"
    }
  }
}

[Agent → User] "Open this URL to sign: https://xrpdomains.xyz/search?prefill=cooldomain.xrp..."
[User signs in wallet, copies signed blob back]

[Agent → MCP]
{
  "method": "tools/call",
  "params": {
    "name": "send_signed_tx",
    "arguments": { "signed_tx_blob": "120000228000..." }
  }
}

[MCP → Agent] { "tx_hash": "ABC123...", "engineResult": "tesSUCCESS" }

[Agent polls check_tx_status every 4s until validated]

[Agent → User] "Done. cooldomain.xrp is now in your portfolio. Tx hash: ABC123..."
```

### B.2 Available-then-suggest flow

```
User: "Suggest 5 short available .xrp domains for me"

[Agent generates 5 candidate names from its knowledge]
[Agent → MCP] check_domains({ domains: ["cat.xrp","dog.xrp","fox.xrp","owl.xrp","bee.xrp"] })
[MCP returns availability + price for each]
[Agent → User] "Available: dog.xrp, fox.xrp. Taken: cat.xrp (by rU4K..), owl.xrp, bee.xrp"
```

---

## 20. Appendix C — XRPL transaction templates

### C.1 NFTokenCreateOffer (transfer)

```json
{
  "TransactionType": "NFTokenCreateOffer",
  "Account": "<owner_address>",
  "NFTokenID": "<64-char-hex>",
  "Amount": "0",
  "Destination": "<recipient_address>",
  "Flags": 1,
  "Fee": "12"
}
```

### C.2 NFTokenAcceptOffer

```json
{
  "TransactionType": "NFTokenAcceptOffer",
  "Account": "<accepter_address>",
  "NFTokenSellOffer": "<offer_id_hex>",
  "Memos": [
    { "Memo": { "MemoData": "<hex(domain)>" } }
  ],
  "Fee": "12"
}
```

### C.3 NFTokenCancelOffer

```json
{
  "TransactionType": "NFTokenCancelOffer",
  "Account": "<owner_address>",
  "NFTokenOffers": ["<offer_id_hex>"],
  "Fee": "12"
}
```

### C.4 NFTokenBurn

```json
{
  "TransactionType": "NFTokenBurn",
  "Account": "<owner_address>",
  "NFTokenID": "<64-char-hex>",
  "Fee": "12"
}
```

### C.5 Payment (register)

```json
{
  "TransactionType": "Payment",
  "Account": "<buyer_address>",
  "Destination": "<treasury_address>",
  "Amount": "<drops_string>",
  "Memos": [
    { "Memo": { "MemoData": "<hex(domain)>", "MemoType": "<hex(\"refcode\")>" } },
    { "Memo": { "MemoData": "<hex(refcode_or_default)>" } },
    { "Memo": { "MemoData": "<hex(discount_value)>" } }
  ],
  "Fee": "12"
}
```

Exact memo layout to be confirmed against backend createOrder during Phase 3 (search.html L840-1130 is the reference).

---

## End of spec

For implementer:
- Read this entire spec before writing code
- §16 (out of scope) is binding — do not touch the v3 web app
- Open §17 questions with product before kickoff
- Phase 1 acceptance criteria (§15) is the merge bar for v1
- Smoke tests (§14.5) are the CI gate on every PR

For reviewer:
- Spec is intentionally verbose for AI-pair-programming clarity
- Tool catalog mirrors sns.id/agent which has shipped and works at scale
- Architecture preserves the rule that XRPName backend remains the only source of truth
