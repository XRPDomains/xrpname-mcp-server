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

---

## 4) Extra X posts — MCP × x402 (community hooks)

Standalone posts to sprinkle in — punchier, more "call to the community." Mix
big-picture, dev-CTA, and provocation. Each fits in one tweet.

### Big picture

> AI agents can already read the web. Now they can **pay** for it — and own what
> they buy.
>
> XRPName = MCP server + x402 on #XRPL. Your agent buys a domain, signs, owns it.
> Mainnet. Live. 👉 github.com/XRPDomains/xrpname-mcp-server

> MCP gives agents tools. #x402 gives them a wallet. #XRPL settles it in ~4s.
> Put all three together and you get agents that **buy, own, and trade** onchain
> assets. We shipped the first one. 🧵 [repo]

> The agent economy isn't agents *talking*. It's agents *transacting*.
> Proof on #XRPL mainnet: an AI agent bought a domain end-to-end — x402 pay +
> NFTokenAcceptOffer, zero humans. 🤖 [repo]

### Dev call-to-action

> Builders 👀 we open-sourced an AI agent that buys #XRPL domains via #x402.
> The mint-gateway is **issuer-agnostic** — point it at YOUR NFTs and agents buy
> them autonomously. Domains were just adapter #1. 🧩 [repo]

> Your MCP agent already has tools. Give it a wallet.
> `npm i`, one prompt — "buy me alice.xrp" → pay (x402) → mint → owned. #XRPL
> mainnet. Drop-in skill 👇 [repo]

> Add agent-native commerce to your app in an afternoon:
> MCP server + a 2-signature x402 flow, fully documented. #XRPL #x402
> → [repo]/tree/main/skills/xrpname-register

### Provocation / credibility

> Not a testnet demo. Not a mockup.
> An AI agent paid, minted, and signed the transfer **itself** — all on #XRPL
> mainnet. receipts 👇
> livenet.xrpl.org/transactions/895F6B8A4DF813DCF11C552C15E6EE9B0DA9AF45C629B13168C5C7ABB59458EA

> Everyone's talking about the "agent economy."
> We shipped a piece of it: an agent that buys its own name on #XRPL, via #x402,
> on mainnet, today. Go make your agent do it 👉 [repo]

### Community challenge (drives replies)

> Challenge: point your agent at our #x402 endpoint and let it register its own
> name on #XRPL. The first request is a **free quote** — no charge.
> What handle will your agent pick? 👀 [repo] #AIagents

> Reply with what your AI agent would buy first if it had an #XRPL wallet.
> (It can — here's how 👇) [repo]

### Reusable tags

@RippleXDev · XRPLF · T54 (facilitator) · #XRPL #x402 #MCP #AIagents #XRP.
Pair any of these with an asset from `docs/promo-assets/` (05-flow.png reads well
on the MCP × x402 "big picture" posts).

---

## 5) X posts — the T54 facilitator integration

Posts that spotlight **why XRPName settles through the T54 x402 facilitator**
(`xrpl-x402.t54.ai`) and its advantages. All points below are from T54's own
docs, so they're safe to claim.

### No-custody / trust

> We didn't roll our own payment rail. XRPName settles agent domain purchases
> through the **T54 x402 facilitator** on #XRPL.
> No-custody: the agent signs, the facilitator only **verifies + settles** —
> nobody holds your key. 🔐
> xrpl-x402.t54.ai

> How does an agent pay with no middleman holding funds?
> Presigned XRPL Payment → T54 facilitator checks amount, destination & invoice
> binding → settles. Underpay = rejected. That's the rail under XRPName.
> xrpl-x402.t54.ai

### Zero friction / agent-native

> x402 on #XRPL via T54 = **no accounts, no API keys, no sessions.**
> Your agent hits the endpoint, pays per request, gets the domain. That's the
> whole flow.
> xrpl-x402.t54.ai · [repo]

> The T54 facilitator is agent-native: agents **discover and pay automatically**
> over plain HTTP 402. We wired XRPName domain registration straight into it.
> One endpoint, two signatures, done. 🤖
> xrpl-x402.t54.ai

### Speed / micropayments

> XRP settles in ~4s and fees are tiny — so **pay-per-action, agent-scale**
> commerce actually works.
> XRPName registers domains on mainnet over the T54 x402 facilitator. ⚡
> xrpl-x402.t54.ai

### XRP + RLUSD

> The T54 x402 facilitator settles **XRP *and* issued assets like RLUSD.**
> XRPName starts with XRP; RLUSD-priced domain buys are next — same rails, same
> agent flow. 💵
> xrpl-x402.t54.ai · [repo]

### Builder CTA

> Building agent commerce on #XRPL? The **T54 x402 facilitator** does the heavy
> lifting — verify + settle presigned payments, XRP or RLUSD, no custody.
> We plugged XRPName into it in days. You can too. 👉 xrpl-x402.t54.ai

> Bonus: T54's stack also has **Verifiable Intent** — a risk/trust layer for
> higher-value agent payments. Room to grow as agent commerce scales. 🧩
> xrpl-x402.t54.ai

*(Confirm T54's official @handle before tagging; the docs URL `xrpl-x402.t54.ai`
is the safe canonical link.)*

**Visual:** attach `docs/promo-assets/06-t54.png` — the Agent → T54 → XRPL flow
with the "no accounts / no API keys / XRP + RLUSD / agent-native" benefit chips.
