# XRPName for Agents — page content

> Nội dung sẵn-để-đưa-lên cho trang `/agent` (mô phỏng cấu trúc sns.id/agent).
> Bên web lấy các mục dưới đây ghép vào page. Mô tả tool = đúng `description`
> thật đang chạy trong MCP server (v0.1.0, 12 tools).

---

## Hero

**Manage .xrp / .xrpl / .xrpfi / .rlusd domains through any AI agent**

The XRPName MCP server lets AI agents discover, look up, and manage XRPL domains —
availability, pricing, profiles, portfolios, and one-click links to register or manage on
xrpdomains.xyz. Connect it to Claude, Cursor, Codex, or any MCP-compatible client.

## Connect

```bash
# Remote (when the hosted server is live — recommended)
claude mcp add xrpname --transport http https://mcp.xrpdomains.xyz/mcp

# Local (bundle, no install — works today)
claude mcp add xrpname -- node <path>/xrpname-mcp-server/bundle/xrpname-mcp.cjs
```

Claude Desktop: install `xrpname-mcp.mcpb` (Settings → Extensions). Restart the client after adding.

## Security — no private key, ever

XRPName MCP is **read-only + web-link**: it reads on-chain/registry data (availability,
profiles, portfolios) and returns **links** to xrpdomains.xyz for every write action
(register, set-primary). The user completes and signs on the website — the MCP builds no
transactions, and no private key ever touches the server or the agent.

Supported TLDs: **.xrp · .xrpl · .xrpfi · .rlusd**

---

## Tools (9)

### Domains

**check_domains** · READ
Check 1 to 25 XRPL domains for registration status and cost. Returns availability, pricing,
owner, profile metadata if registered, a web URL, and invalid_domains for bad inputs.

**recommend_domain** · READ
AI-recommended name suggestions for a keyword or theme (backed by the site's recommender).
Each suggestion is cross-checked for availability, priced, and given a register link.

**register_domain** · LINK
Get the link to register a domain on xrpdomains.xyz. Registration is completed in the
browser (the site creates the order and the wallet signs) — the MCP does not build or
broadcast the payment.

**set_primary_domain** · LINK
Get the link to set a domain as the wallet's primary. Completed in the browser (backend +
wallet signature).

**get_domain_profile** · READ
Full public profile of one domain — owner, NFT token ID, metadata, avatar, socials, linked
addresses, and optionally the on-chain ownership history (`include_history=true`).

### Portfolio

**get_portfolio** · READ
List all XRPL domains owned by a wallet address — domain, nftoken_id, primary flag, length,
TLD, image, mint date, and quick-action URLs. Paginated, sorted, TLD-filterable.

**get_pending_offers** · READ
All pending domain operations for a wallet: incoming offers, outgoing offers, and
paid-but-not-yet-minted orders (continue-mint candidates).

### Status

**check_tx_status** · READ
Check the on-ledger validation status of a transaction by hash (pending / validated /
failed / not_found).

**check_order_status** · READ
Check the backend order status for a domain you tried to register — payment landed, offer
created, mint completed, or failed. Deeper than check_domains (availability only).

---

## Example prompts

**Discovery**
- Is `nftcafe.xrp` available, and how much would it cost?
- Check if these are taken: `web3`, `satoshi`, `21m` (across .xrp/.xrpfi)
- Suggest 5 crypto-themed domain names and tell me which are free
- Show me the full profile and ownership history of `ripple.xrp`

**Registration follow-up**
- I registered `alice.xrpfi` — did my order go through yet?

**Registration & primary**
- Register `coolname.xrpfi` for me
- Make `alice.xrp` my primary domain

**Portfolio**
- What domains does wallet `rLhi87…FZNue` own?
- Do I have any pending offers or transfers on `rLhi87…FZNue`?
- What's the status of transaction `<tx_hash>`?

---

## Notes for the web team

- Registration link uses `…/search?q=<domain>&refcode=<code>` (the `?q=` param runs the
  search + shows Register buttons; `?prefill=` does not — verified live 2026-07).
- Pricing shown by the agent mirrors the site tiers (length-based, launch discount 50%).
- Payment currency: the site supports XRP and RLUSD; the agent currently quotes XRP only.
- Categories above map cleanly to a 3-section layout like sns.id/agent
  (Domains · Portfolio · Status). All write actions are links, not agent-built txs.
