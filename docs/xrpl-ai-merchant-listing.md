# Get XRPName listed as a named merchant on xrpl-ai.org

Goal: our payment address shows a **name** ("XRPName") and an **icon** on
xrpl-ai.org (like `Heurist Inference Router` at
`/address/rBi1QrVjwaNofisZAQnovoXdHkS73FG1tJ`), instead of a bare
"XRPL merchant · rAddr…".

## How the hub sources name + icon (confirmed)

- **Name** comes from the top-level `name` in a `/.well-known/x402` catalog served
  at your origin (or the "Display name" you type at registration). The hub ingests
  the catalog and **binds the name to your payTo address** on first verification.
  A registered service shows its name; an unregistered address shows "XRPL merchant".
- **Icon is NOT a catalog field.** The `.well-known/x402` schema has no logo/icon.
  The hub uses the origin's **favicon / OpenGraph image**. For a guaranteed logo,
  email `support@t54.ai` for a manual listing with your icon.

Real example schema (from `agentnomos.com/.well-known/x402`):

```json
{ "x402Version": 2, "name": "AgentNOMOS", "description": "…",
  "resources": [ { "url": "…", "methods": ["GET","POST"], "name": "…",
    "description": "…", "network": "xrpl:0", "asset": "XRP", "amount": "1000" } ] }
```

## Steps

1. **Host the catalog** at the web root: `https://xrpdomains.xyz/.well-known/x402`.
   Use `docs/well-known/x402.json` in this repo (adjust amounts/resources). It must
   be served with `Content-Type: application/json`. This is a static file the web
   team drops at the site root — it is NOT under the `/mcp` reverse proxy.
2. **Make sure a listed resource returns `402`** on the hub's probe (GET then POST)
   with a `PAYMENT-REQUIRED` header naming `network: xrpl:0` and our `payTo`. The
   gateway pay endpoint (`/mcp/x402/pay/demo-tips`) probes cleanly once the gateway is
   deployed; the register endpoint needs a `{ domain }` body, so the catalog entry
   carries the name/description that the hub ingests directly.
3. **Register the origin** at `https://xrpl-ai.org/join/service` — submit
   `https://xrpdomains.xyz`, Display name `XRPName` (backup for the catalog name).
   The hub re-crawls hourly, so edits to the catalog refresh automatically.
4. **Icon:** ensure `xrpdomains.xyz` serves a crisp favicon + OpenGraph image
   (that's what the hub shows). For a specific logo, email `support@t54.ai` with
   the icon and the payTo address `raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9`.

## Notes

- Merchant identity binds to the **receiving address** (our contract wallet
  `raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9`), which already receives x402 payments — so
  it is already indexable; the listing just gives it a name + icon.
- Give every resource a clear `name` + `description` — the hub ingests them verbatim
  (otherwise it shows "Registered Resource").
- No live endpoint requirement for a manual listing: the email route adds you after
  a quick review.

## Optional: serve the catalog from our own server

If the web team prefers, our Fastify app can serve the catalog too, but the path
must resolve at the site root `/.well-known/x402` (not `/mcp/...`), so the IIS/site
config must route `/.well-known/x402` to it (or just host the static JSON). Static
file at the web root is the simplest.
