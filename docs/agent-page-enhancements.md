# /agent page — enhancements handoff (for web team)

Additions to the **existing** `https://xrpdomains.xyz/agent` page. The page is
already strong (9 tools by category, per-client install, prompts, FAQ). Below are
drop-in additions, in priority order, with placement notes.

---

## 1. Trust badges (hero) — REQUESTED

Place right under the hero title (near "EXPLORE TOOLS / SETUP GUIDE"). Fast option
= shields.io images; you may re-render as custom-styled pills to match the dark theme.

```html
<!-- npm version — auto-updates from npm -->
<a href="https://www.npmjs.com/package/@xrpname/xrpname-mcp" target="_blank" rel="noopener">
  <img src="https://img.shields.io/npm/v/@xrpname/xrpname-mcp?logo=npm&label=npm&style=flat-square&color=cb3837" alt="npm">
</a>

<!-- On MCP Registry — static badge -->
<a href="https://registry.modelcontextprotocol.io/v0/servers?search=xrpname" target="_blank" rel="noopener">
  <img src="https://img.shields.io/badge/MCP%20Registry-listed-6E56CF?style=flat-square" alt="On MCP Registry">
</a>

<!-- optional: MIT license -->
<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT">
```

If rendering custom pills instead, the values are:
- **npm** → `@xrpname/xrpname-mcp` (link to npmjs.com/package/@xrpname/xrpname-mcp)
- **MCP Registry** → listed as `io.github.XRPDomains/xrpname-mcp-server`
- **License** → MIT

---

## 2. "Available on every channel" section — REQUESTED

Place near the existing "Plug it in" install block. Doubles as a reach/trust signal
(most MCP servers ship on only one channel).

**Heading:** Available on every channel
**Sub:** One server — every way to install.

| Channel | How | Note |
|---|---|---|
| 🌐 Remote HTTP | `claude mcp add xrpname-mcp --transport http https://xrpdomains.xyz/mcp` | zero install |
| 📦 npm | `npx -y @xrpname/xrpname-mcp` | local, any MCP client |
| 🗂️ MCP Registry | `io.github.XRPDomains/xrpname-mcp-server` | auto-discovered by registry-aware clients |
| 🖥️ Claude Desktop | download the `.mcpb`, Install from file | one-click extension |

---

## 3. Nice-to-have enhancements (priority order)

### 3a. Live interactive demo — highest impact
An input box on the page that calls the public API live, so visitors *try it* instead
of just reading. Turns a brochure into a product.
- Input a keyword (e.g. `tom`) → call `POST /api/domains/AIRecommend` → show AI name
  ideas, then `GET /api/xrplnft/checkDomains?domain=A,B,C` → mark available + price.
- Or a simple "is `___.xrp` available?" box → `checkDomains`.
- Same-origin calls (page is on xrpdomains.xyz) — no key, no auth, public data.
- This is the single biggest differentiator vs other MCP landing pages.

### 3b. Stats bar (under hero)
`9 tools · 4 TLDs (.xrp · .xrpl · .xrpfi · .rlusd) · 4 install channels · 0 private keys`

### 3c. "Works with" logo strip
Claude · Cursor · Codex · ChatGPT · OpenClaw — reinforces "any MCP client".

### 3d. "Add to Claude" button
Next to "COPY INSTALL COMMAND": a one-click button that copies
`claude mcp add xrpname-mcp --transport http https://xrpdomains.xyz/mcp`.

### 3e. Short demo GIF/video (10–15s) in hero
A conversation: ask → agent suggests names → checks availability → opens register link.
Shows the "magic" of conversational registration.

### 3f. npm downloads badge (later)
Add once there's traffic — social proof:
`https://img.shields.io/npm/dm/@xrpname/xrpname-mcp?style=flat-square`

---

## Reference facts (for copy)

- Package: `@xrpname/xrpname-mcp` (npm, MIT, public)
- Registry name: `io.github.XRPDomains/xrpname-mcp-server`
- Remote endpoint: `https://xrpdomains.xyz/mcp` (Streamable HTTP)
- Repo: `https://github.com/XRPDomains/xrpname-mcp-server`
- Security: read-only + web-link — no transactions built, no private keys held.
- 9 tools: check_domains, recommend_domain, register_domain, set_primary_domain,
  get_domain_profile, get_portfolio, get_pending_offers, check_tx_status, check_order_status.
