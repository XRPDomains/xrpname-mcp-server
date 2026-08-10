# x402 buy client — register an XRPName domain from an agent

This client runs on the **buyer (agent) side**, not on the XRPName server. It
signs two XRPL transactions itself: a **Payment** (via x402) and then an
**NFTokenAcceptOffer** (to take the domain into the wallet). The wallet seed
lives only in this folder's `.env` — it is **never** sent to the server.

## 3 steps

```bash
# 1. Edit .env — set XRPL_BUYER_SEED and pick a DOMAIN (DOMAIN is pre-filled; just add the seed)
# 2. Install deps
npm install
# 3. Run
npm run buy
# or pass the domain directly:
node x402-buy-client.mjs myname.xrp
```

## `.env`

| Variable | Meaning |
|----------|---------|
| `XRPL_BUYER_SEED` | **Required.** Payer wallet seed. Mainnet = real XRP! Needs ~0.5 XRP (0.1 test price + account reserve + fee). |
| `DOMAIN` | The **root** domain to register (1 label + tld), **not** a subname. E.g. `myx402test.xrp`. |
| `RESOURCE_URL` | Endpoint. Defaults to `https://xrpdomains.xyz/mcp/x402/register`. |
| `XRPL_NETWORK` | `xrpl:0` mainnet · `xrpl:1` testnet. |
| `XRPL_RPC` | XRPL node. Defaults to mainnet `wss://xrplcluster.com`. |

## Flow

1. `POST /mcp/x402/register { domain }` → server returns **402** with price + invoiceId.
2. Client signs the **Payment** (x402Fetch handles this) and retries with the signature.
3. Server verifies + settles via the T54 facilitator → calls `createOrder` → mints →
   returns **200** with `offer_id` + `accept_offer_template`.
4. Client signs the **NFTokenAcceptOffer** → `tesSUCCESS` → the domain is in the wallet. ✅

> If it stops at 402: payment did not complete — check the seed / balance. Paste the
> full output (especially `PAYMENT-RESPONSE`) so the facilitator parsing can be
> adjusted if the contract differs.

**Version note:** if `npm install` cannot find `x402-xrpl`, check the package
name/version on npm and update `package.json` to match.
