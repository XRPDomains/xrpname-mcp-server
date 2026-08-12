# Promo kit — Agentic domain registration (x402)

Ready-to-use content to (1) add a section to `xrpdomains.xyz/agent`, and (2)
announce on X. All claims are backed by live mainnet transactions.

## Live proof (mainnet)

Domain `xrpl-x402.xrp`, registered fully autonomously by an agent:

- x402 Payment: [`C397A0B5…12C1F`](https://livenet.xrpl.org/transactions/C397A0B5E120D1B7EE70B416894CB8563E96CF6C04D2ACBD509370E9B8012C1F)
- Mint + sell offer → agent-signed AcceptOffer: [`895F6B8A…458EA`](https://livenet.xrpl.org/transactions/895F6B8A4DF813DCF11C552C15E6EE9B0DA9AF45C629B13168C5C7ABB59458EA)

Use these as the "receipts" in any post.

---

## 1) Website — `/agent` page section

Drop this block into the agent page (copy first, HTML variant below).

### Copy

**Heading:** Buy a domain from your AI agent — via x402

**Subhead:** Any x402-capable agent can register an XRPName domain
(`.xrp`, `.xrpl`, `.xrpfi`, `.rlusd`) autonomously on XRP Ledger mainnet — no
human in the loop, no key ever leaving the agent.

**How it works (3 steps):**

1. Agent calls `POST /mcp/x402/register { domain }` → gets an HTTP **402** price challenge.
2. Agent signs the XRP **Payment** (x402) → XRPName verifies + settles via the T54 facilitator and mints the domain.
3. Agent signs the **NFTokenAcceptOffer** → the domain NFT lands in its wallet.

**Proof:** Registered live on mainnet — `xrpl-x402.xrp`
([payment](https://livenet.xrpl.org/transactions/C397A0B5E120D1B7EE70B416894CB8563E96CF6C04D2ACBD509370E9B8012C1F) ·
[accept](https://livenet.xrpl.org/transactions/895F6B8A4DF813DCF11C552C15E6EE9B0DA9AF45C629B13168C5C7ABB59458EA)).

**CTA buttons:** `Get the skill →` (GitHub `skills/xrpname-register`) ·
`Read the docs →` (SKILL.md) · `MCP: @xrpname/xrpname-mcp →` (npm)

### HTML variant

```html
<section class="agent-x402">
  <h2>Buy a domain from your AI agent — via x402</h2>
  <p>Any x402-capable agent can register an XRPName domain
     (.xrp, .xrpl, .xrpfi, .rlusd) autonomously on XRP Ledger mainnet —
     no human in the loop, no key ever leaving the agent.</p>
  <ol>
    <li><b>Request</b> — <code>POST /mcp/x402/register { domain }</code> → HTTP 402 price challenge.</li>
    <li><b>Pay</b> — agent signs the XRP Payment (x402); XRPName settles via the T54 facilitator and mints.</li>
    <li><b>Own</b> — agent signs the NFTokenAcceptOffer; the domain NFT is in its wallet.</li>
  </ol>
  <p class="proof">✅ Live on mainnet:
     <a href="https://livenet.xrpl.org/transactions/C397A0B5E120D1B7EE70B416894CB8563E96CF6C04D2ACBD509370E9B8012C1F">payment</a> ·
     <a href="https://livenet.xrpl.org/transactions/895F6B8A4DF813DCF11C552C15E6EE9B0DA9AF45C629B13168C5C7ABB59458EA">accept</a>
     — <code>xrpl-x402.xrp</code></p>
  <div class="cta">
    <a href="https://github.com/XRPDomains/xrpname-mcp-server/tree/main/skills/xrpname-register">Get the skill</a>
    <a href="https://github.com/XRPDomains/xrpname-mcp-server/blob/main/skills/xrpname-register/SKILL.md">Docs</a>
    <a href="https://www.npmjs.com/package/@xrpname/xrpname-mcp">MCP server</a>
  </div>
</section>
```

### Quick code snippet to show on the page

```bash
# Any x402 agent, or the bundled client:
npx --yes @xrpname/xrpname-mcp   # MCP server (read tools)
# Buy flow (skill):
node buy.mjs alice.xrp           # pay via x402 → mint → accept → owned
```

---

## 2) X (Twitter) — phased campaign

Run it as an arc: **teaser → coming soon → public launch → follow-ups.** Tease
curiosity first; save the proof + links for the launch.

**Visual assets** (in `docs/promo-assets/`):

| Phase | Post | Attach |
|-------|------|--------|
| 1 | Teaser | `01-teaser.png` |
| 2 | Coming soon | `02-coming-soon.png` |
| 3 | Launch post | `03-demo.gif` (hero) + `03-launch.png` |
| 3 | Launch thread | `05-flow.png` (on tweet 3) |
| 4 | Follow-up | `04-prompt-showcase.png`, `05-flow.png` |

All 1600×900 (X-friendly 16:9); the GIF is ~1000px, 81 KB.

### Phase 1 — Teaser (curiosity, no reveal)

Post one, keep it mysterious. No links, no product name.

> What if your AI agent could *own* a piece of the XRP Ledger — by itself, no
> human clicking "confirm"? 👀
>
> Something's coming. #XRPL #x402

Alt:

> An agent just did something on #XRPL mainnet that used to need a human every
> step. No hints yet. 🤖🔜

### Phase 2 — Coming soon (name the concept, invite follows)

> Soon: any AI agent can **buy & register an XRPL domain on its own** — pay with
> #x402, take custody, done. No dashboards, no seed to paste. Just: *"buy me
> alice.xrp."*
>
> Dropping this week. Follow for the launch. #XRPL #AIagents

*(Optional visual: the prompt line on screen, or a short blurred terminal clip —
show the vibe, not the details yet.)*

### Phase 3 — Public launch

Launch post (single):

> It's live. Tell your agent: "buy me `xrpl-x402.xrp`" — and it's minted and in the wallet. 🤖
>
> Paid via #x402, minted, and the agent signed the NFTokenAcceptOffer itself.
> All on #XRPL mainnet, no human in the loop.
>
> Drop-in agent skill 👇 github.com/XRPDomains/xrpname-mcp-server
>
> proof: livenet.xrpl.org/transactions/895F6B8A4DF813DCF11C552C15E6EE9B0DA9AF45C629B13168C5C7ABB59458EA

### Thread (expanded)

1/ Agents can pay for APIs with x402. We took it one step further: an agent that
**buys and owns an NFT** — an XRPName domain — end-to-end on #XRPL mainnet. 🧵

2/ Why it's not trivial: XRPL can't mint an NFT straight into a buyer's wallet.
Transfer needs the buyer to sign `NFTokenAcceptOffer`. So it's inherently **two
signatures**, both from the agent.

3/ The flow, one endpoint:
• POST /mcp/x402/register { domain } → 402 price
• agent signs XRP Payment (x402) → T54 facilitator settles → domain minted
• agent signs NFTokenAcceptOffer → domain NFT in wallet ✅

4/ No key ever touches our server or the facilitator. The agent holds its own
wallet (dev: env seed; prod: KMS/MPC signer). We hold nothing.

5/ Proven live, not a testnet demo — `xrpl-x402.xrp`:
payment → livenet.xrpl.org/transactions/C397A0B5E120D1B7EE70B416894CB8563E96CF6C04D2ACBD509370E9B8012C1F
accept → livenet.xrpl.org/transactions/895F6B8A4DF813DCF11C552C15E6EE9B0DA9AF45C629B13168C5C7ABB59458EA

6/ It's a drop-in **agent skill** (SKILL.md + a script). Copy it into Claude Code
/ Cursor, or hit the HTTP contract from your own x402 client.
→ github.com/XRPDomains/xrpname-mcp-server/tree/main/skills/xrpname-register

7/ Built on @RippleXDev XRPL + the T54 x402 facilitator. TLDs: .xrp .xrpl .xrpfi
.rlusd. Try it, tell us what your agent buys next. #x402 #XRPL #AIagents

### Phase 4 — Follow-ups (keep momentum, 1–3 days after launch)

Post one every day or two, each a different angle:

- **Prompt showcase:** a chat screenshot — "buy me `defi.xrp`" → domain owned.
- **Dev angle:** "Add domain-buying to your agent in 2 minutes" + repo link + the
  2-signature explainer.
- **Ecosystem:** quote/tag @RippleXDev + T54, frame as one of the first live
  XRPL x402 mint-on-demand flows on mainnet.
- **TLD angle:** ".xrp / .xrpl / .xrpfi / .rlusd — pick one, your agent grabs it."

### Tagging / hashtags

- Tag: XRPL Devs (@RippleXDev), XRPLF, T54 (facilitator), Coinbase x402 team.
- Hashtags: #XRPL #x402 #AIagents #XRP.

### Suggested visual

A 10–15s screen recording (or GIF) of `node buy.mjs xrpl-x402.xrp` running:
402 → payment → mint → `✅ Done — xrpl-x402.xrp is now in r3H4…`. The terminal
output is the whole story; end on the explorer page for the AcceptOffer tx.

Per phase: Phase 1–2 use only a **blurred/short** clip or the prompt line (tease,
don't reveal); Phase 3 shows the **full** run + explorer proof.

---

## 3) Prompts — what the user actually says

The strongest angle: no CLI, no code — the user just asks their agent, in one
sentence, and the agent runs the whole two-signature flow. Use these in the post,
the demo, and the docs.

**Direct buy:**

- "Buy the domain `alice.xrp` for me."
- "Register `mybrand.xrpl` on XRPL."
- "Claim `pay.rlusd` with my agent wallet."

**Conditional (agent checks price first):**

- "Is `fund.xrpfi` available? If it's under 20 XRP, register it."
- "Find a short, free `.xrp` domain for 'defi' and register the first one."

**Autonomous / batch (with a spend guardrail):**

- "You may auto-sign domain purchases under 20 XRP for this session. Register
  `a.xrp`, `b.xrpl`, and `c.xrpfi`."

Under the hood the agent: checks availability + price (XRPName MCP tools) →
confirms with the user (or an approved auto-sign scope) → runs the x402
two-signature flow → reports the tx hashes.

**One-liner for the announcement:** *"Your agent, one sentence — 'buy me
alice.xrp' — and it's minted and in the wallet."*
