# XRPName — canonical MCP connection

Public connection reference for the XRPName MCP server. Publish this on
`xrpdomains.xyz/agent` + docs so clients and directory/audit tools can discover the
canonical endpoint, transport, and auth. (Requested by independent MCP readiness
audits — a minimal public config resolves "endpoint discovery ≠ usability".)

---

## 1. Canonical config

```json
{
  "name": "XRPName",
  "server_url": "https://xrpdomains.xyz/mcp",
  "transport": "streamable_http",
  "authentication": "none",
  "protocol_version": "2025-06-18",
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
- **Rate limit:** 60 req/min per IP (soft — retry with backoff on 429).

---

## 2. Install per client

Every client uses the same underlying config; only the wrapper format differs.

### 2.1 · Claude Code (CLI, hosted HTTP — zero install)

```bash
claude mcp add xrpname-mcp --transport http https://xrpdomains.xyz/mcp
```

Then `/quit` and relaunch `claude`. First tool call auto-discovers the 9 tools.

### 2.2 · Claude Desktop

Config file:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "xrpname-mcp": {
      "url": "https://xrpdomains.xyz/mcp",
      "transport": "http"
    }
  }
}
```

Quit and reopen the app.

**Alternative — one-click extension**: download the `.mcpb` from
[GitHub Releases](https://github.com/XRPDomains/xrpname-mcp-server/releases), then
`Settings → Extensions → Install from file`.

### 2.3 · Cursor

`Cursor → Settings → Features → MCP` — paste:

```json
{
  "xrpname-mcp": {
    "url": "https://xrpdomains.xyz/mcp",
    "transport": "http"
  }
}
```

`Cmd/Ctrl-Shift-P` → *Reload Window*.

### 2.4 · Codex CLI

Config: `~/.codex/config.toml` (macOS/Linux) or `%USERPROFILE%\.codex\config.toml`
(Windows). Create if missing.

```toml
[mcp_servers.xrpname-mcp]
url = "https://xrpdomains.xyz/mcp"
transport = "http"
```

Quit and relaunch the Codex CLI.

### 2.5 · Openclaw

```bash
openclaw mcp register \
  --name xrpname-mcp \
  --transport http \
  --url https://xrpdomains.xyz/mcp
```

Restart Openclaw.

### 2.6 · Any MCP client via npm (local stdio)

```bash
npx -y @xrpname/xrpname-mcp
```

Wrap in the client's stdio config, e.g.:

```json
{
  "xrpname-mcp": {
    "command": "npx",
    "args": ["-y", "@xrpname/xrpname-mcp"]
  }
}
```

### 2.7 · Generic MCP client (Streamable HTTP)

Any client speaking MCP Streamable HTTP can drop the canonical config block from
§1. Client-side knobs worth setting:

- **Timeout** ≥ 15 s (batch `check_domains` up to 25 domains).
- **Retry** exponential backoff on 5xx / 429 (all 7 READ tools are idempotent).
- **User-agent** `"<ClientName>/<version> mcp/<spec-version>"` — helps triage.

---

## 3. Expected handshake

JSON-RPC sequence a client is expected to run on first connection. Reference to
compare against when debugging.

### 3.1 · `initialize` (client → server)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "<client-name>",
      "version": "<client-version>"
    }
  }
}
```

### 3.2 · `initialize` response (server → client)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": { "listChanged": false }
    },
    "serverInfo": {
      "name": "xrpname-mcp",
      "version": "0.1.0"
    }
  }
}
```

Server never announces `resources`, `prompts`, or `sampling` capabilities — this
is read-only + web-link.

### 3.3 · `notifications/initialized` (client → server)

```json
{ "jsonrpc": "2.0", "method": "notifications/initialized" }
```

### 3.4 · `tools/list` — expected 9 tools

```
Domains (5)
  check_domains          READ
  recommend_domain       READ
  register_domain        LINK
  set_primary_domain     LINK
  get_domain_profile     READ

Portfolio (2)
  get_portfolio          READ
  get_pending_offers     READ

Status (2)
  check_tx_status        READ
  check_order_status     READ
```

If the client receives fewer tools, the server version is out of date — check
`README.md` for the current major.

### 3.5 · Sample first `tools/call`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "check_domains",
    "arguments": { "domains": ["nftcafe.xrp"] }
  }
}
```

Response includes availability, price (XRP), owner (if registered), profile URL,
and a web `register_url` if available.

---

## 4. Verification

### 4.1 · One-liner tools list (curl)

```bash
curl -s -X POST https://xrpdomains.xyz/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: JSON with `result.tools` array of length **9**.

### 4.2 · Health

```bash
curl https://xrpdomains.xyz/health
# → { "status": "ok", ... }
```

### 4.3 · Ready + metrics

```bash
curl https://xrpdomains.xyz/ready
curl https://xrpdomains.xyz/metrics   # Prometheus format
```

### 4.4 · Usage dashboard

Human-readable usage stats — connections (installs/sessions), unique clients,
tool-call counts, agent breakdown — with daily / weekly / monthly roll-up.

- **Dashboard:** `https://xrpdomains.xyz/mcp/stats`
- **JSON feed:** `https://xrpdomains.xyz/mcp/stats.json`
- **Detailed view** (per-day tool/agent split, agent versions, method breakdown):
  append `?token=<MCP_STATS_TOKEN>` to either URL.

Data is bucketed by UTC day and persisted to disk (survives restarts). No raw
IPs or tool arguments are stored — unique counts use salted hashes only. Served
through the same `/mcp` reverse-proxy rule, so no extra IIS config is needed.

Other channels (not server-visible): npm downloads via
`https://api.npmjs.org/downloads/point/last-month/@xrpname/xrpname-mcp`;
`.mcpb` downloads via the GitHub Releases API (`assets[].download_count`).

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Client shows "MCP server not responding" | Client is sending WebSocket, server is Streamable HTTP | Verify `transport: "http"` (not `"ws"`) |
| Tools list is empty | `tools/list` called before `initialize` | Ensure `initialize` → `initialized` → `tools/list` order |
| 404 on `/mcp` | Trailing slash or reverse-proxy misroute | Use exact `https://xrpdomains.xyz/mcp` (no trailing `/`) |
| 405 on `/mcp` | Client using GET | MCP is `POST` only in stateless mode |
| 429 rate limit | > 60 req/min from same IP | Back off + retry |
| Empty response body | IIS swallowed backend error | Ensure `<httpErrors existingResponse="PassThrough" />` scoped to `/mcp` |
| CORS error in browser context | Same-origin required from xrpdomains.xyz | Server only allows same-origin fetch from xrpdomains.xyz |
| SSL error | System CA bundle missing DigiCert Global Root | Update system CA bundle |

---

## 6. Operational notes (for whoever runs the origin)

- **Origin:** Node/Fastify on `127.0.0.1:3000`, behind IIS reverse proxy, behind Cloudflare.
- **IIS URL Rewrite:** route `^mcp(/.*)?$` → `http://localhost:3000/mcp{R:1}`
  (before any SPA catch-all, `stopProcessing="true"`), with ARR proxy enabled.
- **IIS error passthrough:** scope `<httpErrors existingResponse="PassThrough" />`
  to `/mcp` so the server's own 4xx/5xx bodies reach clients (not IIS error pages).
- **Cloudflare:** add a Cache Rule to **bypass cache** for `xrpdomains.xyz/mcp*`
  (MCP is dynamic + POST); never cache MCP responses.
- **Health:** `GET http://localhost:3000/health` on the box → 200 JSON.

---

## 7. HTML embed block for `/agent`

The web team can paste the following block into a new "Connection" section on
`/agent` (suggested placement: **right before `#setup`**). Uses existing agent
CSS conventions (`agent-terminal`, `agent-container`, `agent-section-head`).

```html
<section class="agent-connection" id="connection">
  <div class="agent-container">
    <div class="agent-section-head">
      <div class="agent-section-eyebrow">The wire</div>
      <h2 class="agent-section-title">Canonical connection</h2>
      <p class="agent-section-lede">
        One endpoint, streamable HTTP, no auth &mdash; drop this block into any MCP client.
      </p>
    </div>

    <div class="agent-terminal">
      <div class="agent-terminal-head">
        <span class="agent-terminal-dot"></span>
        <span class="agent-terminal-dot"></span>
        <span class="agent-terminal-dot"></span>
        <span class="agent-terminal-label">canonical config</span>
        <button type="button" class="agent-copy-btn"
                data-copy-target="canonical-config" aria-label="Copy">
          <i class="fas fa-copy"></i><span>Copy</span>
        </button>
      </div>
      <pre class="agent-terminal-body" id="canonical-config">{
  "name": "XRPName",
  "server_url": "https://xrpdomains.xyz/mcp",
  "transport": "streamable_http",
  "authentication": "none",
  "protocol_version": "2025-06-18",
  "registry": "io.github.XRPDomains/xrpname-mcp-server",
  "npm": "@xrpname/xrpname-mcp"
}</pre>
    </div>

    <div class="agent-connection-facts">
      <div class="agent-connection-fact">
        <span class="agent-connection-fact-key">Transport</span>
        <span class="agent-connection-fact-val">Streamable HTTP</span>
      </div>
      <div class="agent-connection-fact">
        <span class="agent-connection-fact-key">Protocol</span>
        <span class="agent-connection-fact-val">MCP 2025-06-18</span>
      </div>
      <div class="agent-connection-fact">
        <span class="agent-connection-fact-key">Auth</span>
        <span class="agent-connection-fact-val">none (public)</span>
      </div>
      <div class="agent-connection-fact">
        <span class="agent-connection-fact-key">Tools</span>
        <span class="agent-connection-fact-val">9 (5 Domains &middot; 2 Portfolio &middot; 2 Status)</span>
      </div>
    </div>

    <details class="agent-connection-handshake">
      <summary>Expected handshake</summary>
      <ol>
        <li><code>initialize</code> &rarr; server advertises <code>tools</code> capability</li>
        <li><code>notifications/initialized</code></li>
        <li><code>tools/list</code> &rarr; returns 9 tools</li>
        <li><code>tools/call</code> &rarr; first tool invocation</li>
      </ol>
      <p class="agent-connection-verify">
        Verify: <code>curl -s -X POST https://xrpdomains.xyz/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</code>
      </p>
    </details>
  </div>
</section>
```

**CSS additions** (append to `css/agent.css`):

```css
.agent-connection {
  padding: 72px 0;
  border-top: 1px solid var(--v3-line, rgba(255,255,255,0.06));
}
.agent-connection-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 20px;
}
.agent-connection-fact {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--v3-glass-bg, rgba(255,255,255,0.02));
  border: 1px solid var(--v3-glass-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  font-size: 13px;
}
.agent-connection-fact-key {
  color: var(--v3-muted);
  font-family: var(--v3-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
}
.agent-connection-fact-val {
  color: var(--v3-ink);
  font-weight: 600;
  text-align: right;
}
.agent-connection-handshake {
  margin-top: 20px;
  padding: 16px 20px;
  background: var(--v3-glass-bg, rgba(255,255,255,0.02));
  border: 1px solid var(--v3-glass-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  color: var(--v3-ink-soft);
  font-size: 13.5px;
}
.agent-connection-handshake summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--v3-ink);
  padding-bottom: 8px;
}
.agent-connection-handshake ol { padding-left: 22px; margin: 6px 0; line-height: 1.75; }
.agent-connection-handshake code {
  font-family: var(--v3-mono);
  font-size: 12px;
  background: rgba(255,255,255,0.05);
  padding: 1px 6px;
  border-radius: 3px;
  color: var(--v3-accent);
}
.agent-connection-verify { margin-top: 12px; font-size: 12.5px; }
```

---

## 8. Change log

| Date | Version | Change |
|------|---------|--------|
| 2026-07-04 | 1.0 | Initial doc — 9 tools, MCP protocol 2025-06-18, streamable HTTP transport |
| 2026-07-14 | 1.1 | Add per-client detail, handshake JSON-RPC examples, verification curls, HTML embed block for `/agent` |

---

## 9. Contact

Issues, incorrect handshake behaviour, or transport bugs → open a GitHub issue at
[github.com/XRPDomains/xrpname-mcp-server](https://github.com/XRPDomains/xrpname-mcp-server).
