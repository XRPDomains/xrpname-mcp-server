# XRPName Agent Skills

Skills that let AI agents interact with [XRPName](https://xrpdomains.xyz) domains
on the XRP Ledger.

## `xrpname-register` — buy a domain from an agent, via x402

An agent can **buy and register a root XRPName domain** (`.xrp`, `.xrpl`,
`.xrpfi`, `.rlusd`) end-to-end on XRPL mainnet using the **x402** agentic-payment
protocol — no human in the loop, no private key ever leaving the agent.

```bash
cd xrpname-register
npm install
cp .env.example .env      # set XRPL_BUYER_SEED (a dedicated agent wallet)
node buy.mjs alice.xrp
# → pays via x402, mint happens, agent signs AcceptOffer, domain lands in the wallet
```

**How it works** — one endpoint, two signatures:

1. `POST /mcp/x402/register { domain }` → **402** with the price challenge.
2. Agent signs the XRP **Payment** (x402) → server verifies + settles via the
   T54 facilitator, then mints the domain.
3. Agent signs the **NFTokenAcceptOffer** returned in the 200 response → the
   domain NFT is in the agent's wallet.

The second signature is inherent to XRPL (you cannot mint an NFT straight into
another wallet), and it is exactly what this skill adds on top of a plain x402
payment.

**Proven live on mainnet** — e.g. `xrpl-x402.xrp` was registered fully
autonomously: x402 Payment → mint → `NFTokenAcceptOffer` (`tesSUCCESS`).

### Who it's for

- ✅ **Agent developers** buying domains from a wallet the agent controls
  (dev: seed in `.env`; production: KMS / HSM / MPC external signer).
- 🚫 **Not** for human end-users to paste a personal seed — people buy on the
  [website](https://xrpdomains.xyz) and sign with Xaman (the seed stays on their
  phone).

### Use it

- **Claude Code / Cursor / any skills-aware agent:** copy `xrpname-register/`
  into your agent's skills directory; it reads `SKILL.md` and runs `buy.mjs`.
- **Your own stack:** implement the HTTP contract in
  [`xrpname-register/SKILL.md`](./xrpname-register/SKILL.md) against
  `POST /mcp/x402/register` with your own x402 client + XRPL signer.

Part of the [`@xrpname/xrpname-mcp`](https://www.npmjs.com/package/@xrpname/xrpname-mcp)
MCP server. Full details: [`xrpname-register/SKILL.md`](./xrpname-register/SKILL.md).
