# Architecture — XRPName MCP Server

Standalone Node.js/TypeScript service exposing XRPL domain operations (.xrp / .xrpfi / .xrpl) to AI agents via the Model Context Protocol. Spec: `specs/XRPDomains-MCP-Server-Spec.md`.

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
                    v2 path changes happen here only; see "API versioning" below)
src/types/deps.ts   dependency container; authAddress = DEV_ADDRESS now, OAuth JWT sub later
```

## Identity roadmap

- **Bước 0–2 (now):** `DEV_ADDRESS` env stands in for the authenticated address. Read-only tools work unauthenticated.
- **Bước 3:** OAuth 2.1 + PKCE (public client). `/authorize` page reuses the xrpdomains.xyz wallet kit; wallet signs a nonce; server mints JWT with `sub = XRPL address`. A Fastify preHandler resolves Bearer → `authAddress` per request.

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
or tests changes. Pending TODO: `get_portfolio` needs `getBithompNFT` (path name
to be verified with the backend team) added to the registry.

## Caching (§12.2)

Redis when `REDIS_URL` set, in-memory otherwise. Keys: `mcp:getAddress:<domain>` 60s, `mcp:getName:<address>` 60s, offers 10s. Invalidation on successful `send_signed_tx` (Bước 4).

## Phase status

- ✅ Bước 0: scaffold, stdio + HTTP transports, `check_domains`, `get_domain_profile`, `check_tx_status`, smoke test
- 🔶 Bước 1: `get_pending_offers` ✅ (address bắt buộc; incoming+outgoing offers in parallel) · `get_portfolio` ⬜ (chờ verify endpoint `getBithompNFT`)
- ⬜ Bước 2: Redis rate limiting, `/metrics`, CI hardening
- ⬜ Bước 3: OAuth 2.1 + wallet signature
- ⬜ Bước 4: `send_signed_tx` (testnet verified) → Phase 1 done
- ⬜ Bước 5: staging deploy `mcp-staging.xrpdomains.xyz`
