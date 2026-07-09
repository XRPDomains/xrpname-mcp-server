# Architecture — XRPName MCP Server

Standalone Node.js/TypeScript service exposing XRPL domain operations (.xrp / .xrpl / .xrpfi / .rlusd) to AI agents via the Model Context Protocol. Spec: `specs/XRPDomains-MCP-Server-Spec-v2.md`.

## Principles (binding)

1. **No private keys ever.** Build-tx-not-sign: server returns unsigned tx; user signs in their own wallet.
2. **Pure consumer** of the public `xrpdomains.xyz` REST API + public XRPL JSON-RPC. No DB access, no web-app (`v3/`) code changes.
3. Every future TX response carries a `web_url` fallback to xrpdomains.xyz.
4. Cross-chain is out of scope; types and the tool registry leave room for more TLDs/chains later.

## Layers

```
src/index.ts        HTTP entry — Fastify + Streamable HTTP (stateless, one transport per request)
src/stdio.ts        stdio entry — local installs (Claude Code / Desktop / Codex)
src/server.ts       McpServer factory + tool registration
src/tools/*         one file per tool; registered in tools/index.ts
src/clients/        xrpdomains-api (REST), xrpl-client (wss), cache (Redis | memory)
src/lib/            domain-validator, pricing (mirror of search.html tiers),
                    web-fallback-url, errors (§11 classifier),
                    api-endpoints (SINGLE source of truth for all REST paths —
                    v2 path changes happen here only; see "API versioning" below),
                    metrics (zero-dep Prometheus registry, §13.3),
                    rate-limit (fixed-window via Cache, §12.1)
src/types/deps.ts   dependency container; authAddress = DEV_ADDRESS now, OAuth JWT sub later
```

## Identity roadmap

- **Now:** no auth. Read tools are unauthenticated over public data and take an explicit
  `address`. `DEV_ADDRESS` (optional) only seeds rate-limit keying. OAuth was evaluated and
  removed (see Phase status) — public read data needs no access control.

## v3 web app references (read-only)

| What | Where in v3 |
|---|---|
| Pricing tiers | `search.html` L641–697 (mirrored in `src/lib/pricing.ts`) |
| Tx shapes (transfer/burn) | `js/v3-nft-tx.js` (`buildTransfer`, `buildBurn`) — Phase 2 parity target |
| Treasury + base price | `networks-mainnet.js` (`contractAddress`, `basePrice`, `discount`) |
| API response shapes | `specs/XRPDomains-API-Audit.md` |
| Fee | 12 drops (`V3.Const.xrpl.feeDrops`) |

## API versioning (`src/lib/api-endpoints.ts`)

All xrpdomains.xyz REST paths live in one registry. Each logical operation
(`getAddress`, `getName`, `getOfferByDestination`, `getOfferByOwner`, …) is a
builder function keyed by version. The client (`xrpdomains-api.ts`) calls these
by name and is injected with the active `EndpointSet`, so it never holds a raw
path. Cache keys use stable logical names, not paths, so they survive a path
change.

**To migrate to v2:** add a `v2` `EndpointSet` to the registry and flip
`ACTIVE_API_VERSION` (or wire it to an env var). Nothing in the client, tools,
or tests changes. (Note: `get_portfolio` uses `getAllNames` — the spec's
suggested `getBithompNFT` returns 404 and is not used.)

## v2 endpoint alignment (post Jun 12 BE consolidation)

The backend shipped aggregator endpoints; the registry + clients now consume them:

| Tool | v2 endpoint | Win |
|---|---|---|
| `check_domains` | `checkDomains?domain=A,B,C` (batch) + `getAddress` follow-up for registered profiles | N calls → 1 (+ few) |
| `get_portfolio` | `getAllNames?address=&limit=&page=` — `primary_domain` at root (no `getName`), `has_next` pagination | drops a call, richer entries |
| `get_pending_offers` | `getPendingDomains?owner=` — `mint[]`+`incoming[]`+`outgoing[]` in one snapshot | 3+5N calls → 1 |
| `get_domain_profile` | `getAddress?domain=&include=history` for the ownership timeline | merges the old 2-call Bithomp flow |

Legacy paths (`getOfferByDestination/Owner`, per-NFT resolvers, `getBithompNFT` pass-through)
remain in the registry as back-compat but are no longer on the hot path. Response-shape
normalisers (`src/lib/portfolio.ts`, the tool mappers) tolerate the backend's
two `getAllNames` shapes and an unreliable `total` field.

## Caching (§12.2)

Redis when `REDIS_URL` set, in-memory otherwise. Keys: `mcp:getAddress:<domain>` 60s, `mcp:getName:<address>` 60s, offers 10s. Invalidation on successful `send_signed_tx` (Bước 4).

## Rate limiting + metrics (Bước 2)

**Rate limit (§12.1)** — fixed-window counter in `src/lib/rate-limit.ts`, backed
by the same `Cache` abstraction (Redis atomic `INCR`+`EXPIRE`, in-memory
otherwise) so no extra dependency is needed. The `/mcp` handler gates each
request: keyed by authenticated address (READ budget 60/min) when present, else
by IP (unauth 30/min). On limit it returns `429` + `Retry-After`; every response
carries `RateLimit-Limit/Remaining/Reset` headers. `resolveLimit()` is the seam
OAuth (Bước 3) plugs into. Tunable via `RATE_LIMIT_*` env vars.

**Metrics (§13.3)** — `src/lib/metrics.ts` is a zero-dependency Prometheus
registry (chosen over `prom-client` to keep the dep tree small for a fixed metric
set). `GET /metrics` exposes `mcp_requests_total{tool,outcome}`,
`mcp_request_duration_seconds` (histogram), `mcp_cache_events_total{result}`
(instrumented in `Cache.get`), `mcp_xrpl_submit_total` (Bước 4), and
`process_uptime_seconds`.

## Phase status

- ✅ Bước 0: scaffold, stdio + HTTP transports, `check_domains`, `get_domain_profile`, `check_tx_status`, smoke test
- ✅ Bước 1: `get_pending_offers` (address bắt buộc; incoming+outgoing in parallel) · `get_portfolio` (`GET /api/xrplnft/getAllNames?address=...`). **The endpoint returns TWO shapes** — a flat string list, or a paginated rich-object list (`nftoken_id`/`metadata.image`/`createtime`/`is_primary`). `src/lib/portfolio.ts` normalises both; the client follows pagination (cap 20 pages); the tool fills nftoken_id/image_url/minted_at/is_primary when available. Parser drops junk + keeps emoji/exotic TLD; `skipped`/`owner_total` surface backend data-quality gaps.
- ✅ Bước 2: rate limiting (fixed-window qua Cache, Redis|memory) · `/metrics` Prometheus · CI hardened (Node 20+22 matrix, build step, npm cache, concurrency, non-blocking live smoke job)
- ⬛ Bước 3 (OAuth): **removed by product decision** — the MCP is read-only over public data, so identity/auth adds no access control. Read tools take an explicit `address`; the deleted JWT/auth/PKCE/oauth code is gone. Rate limiting keys by IP (or DEV_ADDRESS if set). Revisit only if a "my domains" convenience (wallet login) is wanted later.
- ⬛ Bước 4 (write path): **removed by product decision** — the MCP builds no transactions. All write actions delegate to the website: `register_domain` and `set_primary_domain` return xrpdomains.xyz **links** (register needs backend `createOrder`; set-primary needs auth'd `/api/xrplnft/setPrimary`), where the wallet signs. `web-fallback-url.ts` uses `?q=` (not `?prefill=`) — verified live 2026-07 that `?q=` runs the search + shows Register buttons. (The earlier `transfer/accept/cancel/burn/send_signed_tx` + `tx-build`/`tx-encode`/`tx-invalidate` code was deleted.)
- ⬜ Bước 5: staging deploy `mcp-staging.xrpdomains.xyz`
