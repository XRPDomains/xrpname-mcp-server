# XRPName — canonical MCP connection

Public connection reference for the XRPName MCP server. Publish this on
`xrpdomains.xyz/agent` + docs so clients and directory/audit tools can discover the
canonical endpoint, transport, and auth. (Requested by independent MCP readiness
audits — a minimal public config resolves "endpoint discovery ≠ usability".)

## Canonical config

```json
{
  "name": "XRPName",
  "server_url": "https://xrpdomains.xyz/mcp",
  "transport": "streamable_http",
  "authentication": "none",
  "registry": "io.github.XRPDomains/xrpname-mcp-server",
  "npm": "@xrpname/xrpname-mcp"
}
```

- **Transport:** Streamable HTTP (stateless). Tool calls are `POST /mcp` with a
  JSON-RPC body; `Accept: application/json, text/event-stream`.
- **Auth:** none — all tools are read-only over public XRPL/registry data. Write
  actions return xrpdomains.xyz links where the user's wallet signs. No API key,
  no private key ever touches the server.
- **Non-POST methods** to `/mcp` return `405 Method Not Allowed` (stateless mode).

## Install per client

```bash
# Claude Code — hosted HTTP (no install)
claude mcp add xrpname-mcp --transport http https://xrpdomains.xyz/mcp

# Any MCP client — local via npm
npx -y @xrpname/xrpname-mcp

# Claude Desktop — extension from GitHub Releases
# download bundle/xrpname-mcp.mcpb → Settings → Extensions → Install from file
```

## Expected handshake (for verifiers)

`POST /mcp` with an `initialize` request returns a JSON-RPC `result`, then
`tools/list` returns **9 tools**:

`check_domains`, `recommend_domain`, `get_domain_profile`, `check_tx_status`,
`check_order_status`, `get_pending_offers`, `get_portfolio`, `register_domain`,
`set_primary_domain`.

## Operational notes (for whoever runs the origin)

- Origin: Node/Fastify on `127.0.0.1:3000`, behind IIS reverse proxy, behind Cloudflare.
- IIS: a URL Rewrite rule must route `^mcp(/.*)?$` → `http://localhost:3000/mcp{R:1}`
  (before any SPA catch-all, `stopProcessing="true"`), with ARR proxy enabled.
- IIS: scope `<httpErrors existingResponse="PassThrough" />` to `/mcp` so the
  server's own 4xx/5xx bodies reach clients (not IIS error pages).
- Cloudflare: add a Cache Rule to **bypass cache** for `xrpdomains.xyz/mcp*`
  (MCP is dynamic + POST); never cache MCP responses.
- Health: `GET http://localhost:3000/health` on the box → 200 JSON.
