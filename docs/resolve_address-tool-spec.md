# MCP tool spec — `resolve_address`

**Version**: 1.0 · **Date**: 2026-08-03 · **Priority**: 🔥 High (Month 2)

**One-liner**: New MCP tool that mirrors the `/lookup` web page — takes an XRPL address, returns primary XRPName + all owned domains. Read-only, no auth, ~1h implementation.

**Handoff to**: `xrpname-mcp-server` team (this repo).
**Web analog**: `xrpdomains.xyz/lookup` — spec at `v3/specs/Find-Your-Domain-Spec.md`.

---

## 1. Rationale

Chú added Reverse Resolution on the web (Wallet Lookup page). AI agents (Claude/Cursor/Codex/OpenClaw) should have the same capability natively via MCP — otherwise every "who owns rXXX?" prompt requires the user to open a browser.

**Killer prompts this tool enables**:

```
"Who owns rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn?"
"Look up this XRPL address for me: rXXXX — what names does it have?"
"Does @alice.xrp own any other XRPNames?"      ← chained with get_domain_profile
"Which wallet owns the most .xrpfi domains?"   ← agent iterates candidates
```

**Placement** in existing 9-tool taxonomy:

```
Domains (5)     — check_domains, recommend_domain, register_domain, set_primary_domain, get_domain_profile
Portfolio (2)   — get_portfolio, get_pending_offers
Status (2)      — check_tx_status, check_order_status
```

`resolve_address` fits into **Portfolio** group (address-centric read) — new **10th tool**.

Alternative naming considered: `lookup_wallet`, `whois_address`, `who_owns`. `resolve_address` is the industry term (mirrors ENS' `resolver.reverse(address)` pattern).

---

## 2. Tool definition

### 2.1 · Metadata

| Field | Value |
|-------|-------|
| **Name** | `resolve_address` |
| **Category** | Portfolio |
| **Mode** | READ |
| **Auth** | none (public data) |
| **BE endpoints used** | `/api/xrplnft/getName` + `/api/xrplnft/getAllNames` (both existing) |

### 2.2 · Description (for MCP `description` field)

> Reverse resolution: given an XRPL address, return its primary XRPName (if set) and the full list of names owned by the wallet. Use when the user says "who owns [address]?", "look up this wallet", "what names does [address] have?", or when chained with `get_domain_profile` to explore a wallet's identity. Returns empty result if the address doesn't own any XRPName.

### 2.3 · Input schema (Zod)

```ts
import { z } from 'zod';

const resolveAddressInput = z.object({
    address: z.string()
        .regex(
            /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/,
            'Must be a valid XRPL classic address starting with "r" (25-35 characters, base58).'
        )
        .describe('XRPL classic address, e.g. "rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn".'),

    include_history: z.boolean().optional().default(false)
        .describe('If true, include per-domain first-mint date and NFT token id. Otherwise only domain + tld.'),

    limit: z.number().int().min(1).max(200).optional().default(100)
        .describe('Maximum number of domains to return (server-side cap 200).'),
});
```

### 2.4 · Output shape

**Success (found)**:

```json
{
  "address": "rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn",
  "found": true,
  "primary": "alice.xrp",
  "primary_url": "https://xrpdomains.xyz/name/alice.xrp",
  "total_owned": 12,
  "returned_count": 12,
  "domains": [
    {
      "domain": "alice.xrp",
      "tld": ".xrp",
      "length": 5,
      "is_primary": true,
      "nftoken_id": "00080000...",           // only if include_history=true
      "mint_date": "2026-05-14T09:32:11Z",   // only if include_history=true
      "profile_url": "https://xrpdomains.xyz/name/alice.xrp"
    },
    {
      "domain": "alice.xrpfi",
      "tld": ".xrpfi",
      "length": 5,
      "is_primary": false,
      "profile_url": "https://xrpdomains.xyz/name/alice.xrpfi"
    }
    // ...
  ],
  "web_url": "https://xrpdomains.xyz/lookup?address=rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn",
  "bithomp_url": "https://bithomp.com/explorer/rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn"
}
```

**Success (found but no primary set)**:

```json
{
  "address": "rXXX...",
  "found": true,
  "primary": null,
  "primary_url": null,
  "total_owned": 3,
  "returned_count": 3,
  "domains": [ /* ... */ ],
  "note": "This wallet owns names but hasn't designated a primary. Any name resolves the address, but no reverse-lookup canonical name.",
  "web_url": "https://xrpdomains.xyz/lookup?address=rXXX",
  "bithomp_url": "https://bithomp.com/explorer/rXXX"
}
```

**Empty (address valid, no domains)**:

```json
{
  "address": "rXXX...",
  "found": false,
  "primary": null,
  "primary_url": null,
  "total_owned": 0,
  "returned_count": 0,
  "domains": [],
  "message": "No XRPNames found for this address. The wallet doesn't own any names yet.",
  "register_url": "https://xrpdomains.xyz/search",
  "web_url": "https://xrpdomains.xyz/lookup?address=rXXX"
}
```

**Error — invalid address**:

```json
{
  "error": "INVALID_INPUT",
  "message": "Not a valid XRPL classic address. Must start with 'r' and be 25-35 characters (base58 alphabet, no 0/O/I/l).",
  "input": "rBADbadbadbad!!!"
}
```

**Error — network / upstream failure**:

```json
{
  "error": "UPSTREAM_FAIL",
  "message": "Failed to reach xrpdomains.xyz. Retry in a few seconds.",
  "retry_after_ms": 2000
}
```

---

## 3. Implementation

### 3.1 · Suggested file layout

```
src/tools/
  resolve-address.ts         ← NEW · new tool registration
src/lib/
  api-endpoints.ts           ← add helpers (see §3.4)
  domain-validator.ts        ← reuse existing isValidAddress()
```

### 3.2 · Code sketch (`src/tools/resolve-address.ts`)

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpToolError, toErrorResult } from '../lib/errors.js';
import { profileUrl, searchUrl } from '../lib/web-fallback-url.js';
import type { Deps } from '../types/deps.js';

const R_ADDR = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/;

export function registerResolveAddress(server: McpServer, deps: Deps): void {
    server.registerTool(
        'resolve_address',
        {
            description:
                'Reverse resolution: given an XRPL address, return its primary XRPName (if set) ' +
                'and the full list of names owned by the wallet. Use when the user says ' +
                '"who owns [address]?", "look up this wallet", or "what names does [address] have?". ' +
                'Returns empty result if the address doesn\'t own any XRPName.',
            inputSchema: {
                address: z.string().regex(R_ADDR).describe(
                    'XRPL classic address, e.g. "rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn".'
                ),
                include_history: z.boolean().optional().default(false).describe(
                    'If true, include per-domain first-mint date and NFT token id.'
                ),
                limit: z.number().int().min(1).max(200).optional().default(100),
            },
        },
        async ({ address, include_history, limit }) => {
            try {
                if (!R_ADDR.test(address)) {
                    throw new McpToolError(
                        'INVALID_INPUT',
                        `"${address}" is not a valid XRPL address (must start with "r", 25-35 chars).`
                    );
                }

                /* Parallel fetch — same pattern as web /lookup page. */
                const [primary, portfolio] = await Promise.all([
                    deps.api.getName(address).catch(() => ''),
                    deps.api.getAllNames(address, /*page=*/ 1, limit).catch(() => []),
                ]);

                const web = deps.config.webBase;

                if (!primary && (!portfolio || portfolio.length === 0)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    address,
                                    found: false,
                                    primary: null,
                                    primary_url: null,
                                    total_owned: 0,
                                    returned_count: 0,
                                    domains: [],
                                    message: 'No XRPNames found for this address.',
                                    register_url: searchUrl('', { webBase: web }),
                                    web_url: `${web}/lookup?address=${encodeURIComponent(address)}`,
                                }, null, 2),
                            },
                        ],
                    };
                }

                const list = (portfolio || []).map((d) => {
                    const domain = d.domain || d.Domain || d.name;
                    const tldMatch = String(domain).match(/\.[a-z]+$/i);
                    const tld = tldMatch ? tldMatch[0].toLowerCase() : '';
                    const base: any = {
                        domain,
                        tld,
                        length: (domain || '').replace(tld, '').length,
                        is_primary: domain === primary,
                        profile_url: profileUrl(domain, { webBase: web }),
                    };
                    if (include_history) {
                        base.nftoken_id = d.nftoken_id || d.NFTokenID || null;
                        base.mint_date = d.mint_date || d.mintDate || d.createdAt || null;
                    }
                    return base;
                });

                const payload = {
                    address,
                    found: true,
                    primary: primary || null,
                    primary_url: primary ? profileUrl(primary, { webBase: web }) : null,
                    total_owned: list.length,
                    returned_count: list.length,
                    domains: list,
                    ...(primary ? {} : {
                        note:
                            'This wallet owns names but hasn\'t designated a primary. ' +
                            'Any name resolves the address, but no reverse-lookup canonical name.',
                    }),
                    web_url: `${web}/lookup?address=${encodeURIComponent(address)}`,
                    bithomp_url: `https://bithomp.com/explorer/${encodeURIComponent(address)}`,
                };

                return {
                    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
                };
            } catch (err) {
                return toErrorResult(err);
            }
        }
    );
}
```

### 3.3 · Register in `tools/index.ts`

```ts
import { registerResolveAddress } from './resolve-address.js';
// ...
export function registerAllTools(server: McpServer, deps: Deps): void {
    registerCheckDomains(server, deps);
    registerRecommendDomain(server, deps);
    registerRegisterDomain(server, deps);
    registerSetPrimaryDomain(server, deps);
    registerGetDomainProfile(server, deps);
    registerGetPortfolio(server, deps);
    registerGetPendingOffers(server, deps);
    registerCheckTxStatus(server, deps);
    registerCheckOrderStatus(server, deps);
    registerResolveAddress(server, deps);            //  ← NEW
}
```

### 3.4 · `api-endpoints.ts` additions (if not already present)

```ts
// Already exists — reuse:
//   endpoints.getName(address)     → GET /api/xrplnft/getName?address=X
//   endpoints.getAllNames(address, page, limit)
```

`deps.api.getName` and `deps.api.getAllNames` already exist per audit (used by `get_portfolio` and `get_domain_profile`) — no client code needs new endpoints.

---

## 4. Test cases

### 4.1 · Unit tests (Vitest)

```ts
// test/tools/resolve-address.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('resolve_address', () => {
    it('rejects invalid address format', async () => {
        // input: "notanaddress"
        // expect: INVALID_INPUT error
    });

    it('returns primary + portfolio for wallet with names', async () => {
        // mock getName → 'alice.xrp'
        // mock getAllNames → [alice.xrp, alice.xrpfi, dev.alice.xrp]
        // expect payload.primary === 'alice.xrp' && domains.length === 3
    });

    it('marks is_primary correctly', async () => {
        // mock getName → 'alice.xrp'
        // mock getAllNames → [alice.xrpfi, alice.xrp]
        // expect domains[1].is_primary === true, domains[0].is_primary === false
    });

    it('returns empty payload for wallet with no names', async () => {
        // mock getName → ''
        // mock getAllNames → []
        // expect payload.found === false && payload.register_url set
    });

    it('handles wallet with names but no primary set', async () => {
        // mock getName → ''
        // mock getAllNames → [some.xrp]
        // expect payload.primary === null && payload.note contains "primary"
    });

    it('includes history fields when include_history=true', async () => {
        // input: { address, include_history: true }
        // expect domains[0].nftoken_id defined + mint_date defined
    });

    it('omits history fields by default', async () => {
        // expect domains[0].nftoken_id undefined
    });

    it('caps limit at 200', async () => {
        // input: { limit: 500 } → zod should reject or clamp to 200
    });
});
```

### 4.2 · Smoke test (chú's real wallet)

```bash
# From MCP server dir
npm run smoke -- --tool resolve_address --address rXXXChuAddr
```

Expected output includes chú's primary name + all owned domains.

### 4.3 · Integration via Claude Code

```bash
claude mcp add xrpname-mcp --transport http https://xrpdomains.xyz/mcp
claude
> Who owns rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn?
```

Agent should call `resolve_address` → return summary.

---

## 5. Documentation updates

After ship:

1. **`docs/agent-page-content.md`** — add `resolve_address` to Portfolio group (now 3 tools instead of 2). Update total: `Tools (10)`.
2. **`docs/mcp-connection.md`** — update handshake §3.4 tools list: 10 tools. Update JSON snippet output count.
3. **`README.md`** — bump tool count 9 → 10. Add example prompt.
4. **v3 website `agent.html`** — em (Cowork) sẽ update:
    - Tool count 9 → 10
    - Add `resolve_address` card in Portfolio group (2 tools → 3)
    - Add prompt in Portfolio group: `"Who owns rLhi87…FZNue?"`
    - Bump cache stamp
    - Regenerate `assets/Week-3-Post-3.2-9-Tools-Breakdown.svg` → rename to 10-Tools

---

## 6. Rate limiting

Same as other read tools — 60 req/min per client IP (§ MCP rate limit config).

`resolve_address` calls 2 BE endpoints per invocation (getName + getAllNames). Consider:
- Cache both responses 60s (shared with `get_domain_profile` and `get_portfolio` if possible)
- If chú's cache layer (V3.ApiCache pattern) is available server-side, reuse

---

## 7. Example prompts (for agent-page-content.md example section)

Add to "Portfolio" prompts group:

```
- Who owns rLhi87eXFZNueP4Kg1jUuHmm7pWZBoT3Yn?
- Look up wallet rXXX — what XRPNames does it have?
- Does the wallet at [address] own alice.xrp? (chained with get_domain_profile)
- Find the primary name for rXXX and open its profile.
```

---

## 8. Success metrics (post-ship)

Track (via MCP telemetry if instrumented):

- Adoption: % of MCP calls that use `resolve_address` (target ≥ 10% within Month 1)
- Empty rate: % of lookups returning `found: false` (helps calibrate real usage)
- Follow-ups: how often `resolve_address` is chained with `get_domain_profile` (indicates deeper flow)

---

## 9. Timeline

| Task | Effort | Owner |
|------|--------|-------|
| Implement `resolve_address.ts` per §3.2 | 1h | MCP dev |
| Wire in `tools/index.ts` | 5 min | MCP dev |
| Write unit tests (§4.1) | 45 min | MCP dev |
| Smoke test + Claude Code manual verify | 15 min | MCP dev |
| Bump version 0.1.x → 0.1.(x+1) | 5 min | MCP dev |
| Publish npm + update MCP Registry | 15 min | MCP dev |
| Update docs (§5.1-3) | 15 min | MCP dev |
| Notify Cowork em to update /agent page | — | ping em |

**Total**: ~3h dev time for MCP team, ~1h em to update web.

---

## 10. Handoff checklist

MCP team:

- [ ] Review this spec, raise questions
- [ ] Implement `resolve_address.ts` + tests
- [ ] Verify against real prod BE (mainnet address with known primary)
- [ ] Confirm `deps.api.getName` + `deps.api.getAllNames` signatures match §3.2
- [ ] Update `docs/agent-page-content.md` + `docs/mcp-connection.md` + `README.md`
- [ ] Ship new npm version + Registry update
- [ ] Ping Cowork em (chú) with release notes → em updates /agent page

Web team (em / Cowork):

- [ ] Update `v3/agent.html` — add tool card + prompt + bump total 9 → 10
- [ ] Regenerate `marketing/assets/Week-3-Post-*.svg` with 10 tools
- [ ] Update marketing threads Week 3 mentioning the tool

---

## 11. Change log

| Date | Version | Change |
|------|---------|--------|
| 2026-08-03 | 1.0 | Initial spec — new tool `resolve_address`, ~3h MCP implementation, zero BE change |
