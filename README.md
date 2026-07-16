# XRPName MCP Server

[![npm](https://img.shields.io/npm/v/@xrpname/xrpname-mcp?logo=npm&label=npm&color=cb3837)](https://www.npmjs.com/package/@xrpname/xrpname-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=xrpname)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

XRPL domains for AI agents. XRPName exposes the [XRPDomains](https://xrpdomains.xyz)
naming system — `.xrp`, `.xrpl`, `.xrpfi`, `.rlusd` — over the
[Model Context Protocol](https://modelcontextprotocol.io) so assistants like
Claude, Cursor, and Codex can check availability, look up pricing and profiles,
read a wallet's portfolio, and hand the user a registration link.

**Read-only + web-link by design.** The server only reads public XRPL and
registry data; write actions (register, set primary) return an `xrpdomains.xyz`
link the user opens and signs in their own wallet. No API key, no private key,
no transaction is ever built or held by this server.

## Tools

| Tool | Kind | What it does |
|------|------|--------------|
| `check_domains` | read | Availability, price, and owner for up to 25 domains at once |
| `recommend_domain` | read | AI name suggestions for a keyword, with availability + price |
| `get_domain_profile` | read | Full profile for a registered domain (owner, records, history) |
| `get_portfolio` | read | All domains held by an XRPL address |
| `get_pending_offers` | read | Pending buy/sell offers and mints for an address |
| `check_tx_status` | read | Status of an XRPL transaction by hash |
| `check_order_status` | read | Status of a registration order by domain |
| `register_domain` | link | Returns an `xrpdomains.xyz` link to register an available domain |
| `set_primary_domain` | link | Returns a link to set a domain as the address's primary |

## Install

### Hosted (recommended — zero install)

The server runs remotely at `https://xrpdomains.xyz/mcp` (Streamable HTTP, no auth).

```bash
# Claude Code
claude mcp add xrpname-mcp --transport http https://xrpdomains.xyz/mcp
```

Claude Desktop / Cursor — add to the MCP config:

```json
{
  "mcpServers": {
    "xrpname-mcp": { "url": "https://xrpdomains.xyz/mcp", "transport": "http" }
  }
}
```

### Local (this npm package — stdio)

Runs the same tools locally, talking to the public XRPDomains API. No credentials needed.

```bash
npx -y @xrpname/xrpname-mcp
```

Wire it into any MCP client's stdio config:

```json
{
  "mcpServers": {
    "xrpname-mcp": { "command": "npx", "args": ["-y", "@xrpname/xrpname-mcp"] }
  }
}
```

A one-click Claude Desktop extension (`.mcpb`) is attached to each
[GitHub Release](https://github.com/XRPDomains/xrpname-mcp-server/releases).

## Configuration

All settings are optional — defaults point at the public mainnet API.

| Variable | Default | Purpose |
|----------|---------|---------|
| `XRPDOMAINS_API_BASE` | `https://xrpdomains.xyz` | Backend REST API base |
| `XRPL_WSS_URL` | `wss://xrplcluster.com` | XRPL node for tx status |
| `REDIS_URL` | _(in-memory)_ | Optional cache/rate-limit backend |
| `PORT` | `3000` | HTTP port (remote transport only) |
| `LOG_LEVEL` | `info` | Pino log level |

See [`.env.example`](./.env.example) for the full list (rate limiting, analytics).

## Links

- **Setup & all tools:** https://xrpdomains.xyz/agent
- **MCP Registry:** `io.github.XRPDomains/xrpname-mcp-server`
- **Repository:** https://github.com/XRPDomains/xrpname-mcp-server
- **Issues:** https://github.com/XRPDomains/xrpname-mcp-server/issues

## Development

```bash
npm ci
npm run build        # tsc → dist/
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run dev          # remote HTTP server (watch)
npm run dev:stdio    # local stdio server (watch)
```

## License

MIT © XRPDomains. See [LICENSE](./LICENSE).
