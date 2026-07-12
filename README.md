# XRPName MCP Server

[![CI](https://github.com/XRPDomains/xrpname-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/XRPDomains/xrpname-mcp-server/actions/workflows/ci.yml)

Repo: <https://github.com/XRPDomains/xrpname-mcp-server>

XRPL domain operations (`.xrp` / `.xrpl` / `.xrpfi` / `.rlusd`) for AI agents via the [Model Context Protocol](https://modelcontextprotocol.io). Check availability, look up profiles, manage portfolios and (later) build transfer/registration transactions — all from Claude, Codex, Cursor or any MCP client.

**Status: read-only + web-link (v0.1).** Tools: `check_domains`, `recommend_domain`, `get_domain_profile`, `check_tx_status`, `check_order_status`, `get_pending_offers`, `get_portfolio`, `register_domain`, `set_primary_domain`. The MCP builds NO transactions — all write actions (register, transfer, set-primary) are completed on xrpdomains.xyz where the wallet signs. No private keys ever touch this server.

## Quick start

```bash
npm install
npm run build
npm test           # unit tests
npm run smoke      # spawns the server, MCP handshake + calls every tool
```

Run without building: `npm run dev` (HTTP, port 3000) or `npm run dev:stdio`.

## Install in Claude Code

```bash
# npx (once published to npm — simplest, no clone)
claude mcp add xrpname -- npx -y @xrpname/xrpname-mcp

# stdio from a local build
claude mcp add xrpname -- node ./dist/stdio.js

# or HTTP (hosted / run `npm start` first)
claude mcp add --transport http xrpname https://xrpdomains.xyz/mcp
```

## Install in Claude Desktop

Install the `bundle/xrpname-mcp.mcpb` extension (Settings → Extensions → Install from file), or add to `claude_desktop_config.json` → `mcpServers`:

```json
{
  "mcpServers": {
    "xrpname": { "command": "npx", "args": ["-y", "@xrpname/xrpname-mcp"] }
  }
}
```

## Install in Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.xrpname]
command = "npx"
args = ["-y", "@xrpname/xrpname-mcp"]
```

Then try: *"Is nftcafe.xrp available, and how much would it cost?"*

## Configuration

Copy `.env.example` → `.env`. Everything has sane defaults; Redis is optional (in-memory cache fallback). `DEV_ADDRESS` fakes the authenticated wallet until OAuth ships (Bước 3).

## Endpoints (HTTP mode)

| Route | Purpose |
|---|---|
| `POST /mcp` | MCP JSON-RPC (stateless Streamable HTTP) — rate-limited (§12.1) |
| `GET /health` | Liveness — XRPL reachability |
| `GET /ready` | Readiness |
| `GET /metrics` | Prometheus exposition (request counts, latency, cache hit rate) |

## Project docs

- `docs/ARCHITECTURE.md` — layers, identity roadmap, v3 references
- `specs/XRPDomains-MCP-Server-Spec-v2.md` — current spec (post Jun 12 BE consolidation; v1 archived alongside). §16 out-of-scope is binding: never modify the v3 web app)

## Roadmap

Bước 0 ✅ scaffold + 3 read tools + smoke → Bước 1 portfolio/pending-offers → Bước 2 rate-limit + metrics → Bước 3 OAuth 2.1 wallet-signature → Bước 4 `send_signed_tx` (testnet) → Bước 5 staging `mcp-staging.xrpdomains.xyz`. Phase 2+ adds tx-build tools (`transfer_domain_tx`, …) and registration.
