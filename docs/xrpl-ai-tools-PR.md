# PR kit — get XRPName listed on the official xrpl.org "AI Tools" page

## What this is (plain version)

xrpl.org has an official **AI Tools** page that lists MCP servers and skills
developers can use to build on XRPL with AI:
https://xrpl.org/resources/dev-tools/ai-tools

That page is open source — it lives as a Markdown file in XRPL's GitHub repo.
Anyone can propose an addition by editing that file and opening a **Pull Request
(PR)** — a request to change someone's repo that their maintainers review and
merge. If merged, **XRPName shows up on the official xrpl.org page**: free,
high-trust exposure to exactly the developers we want.

- **File to edit:** `resources/dev-tools/ai-tools.md`
- **In repo:** https://github.com/XRPLF/xrpl-dev-portal (branch `master`)
- **What we add:** two short entries — one under "MCP Servers", one under
  "SKILL.md".

This document is just the ready-to-paste text + step-by-step. You don't need to
write anything yourself.

---

## Step-by-step (via the GitHub website — no local git needed)

1. Sign in to GitHub, open the file in the browser:
   https://github.com/XRPLF/xrpl-dev-portal/blob/master/resources/dev-tools/ai-tools.md
2. Click the **pencil icon** (✏️ "Edit this file"). GitHub will say it created a
   fork under your account — that's expected; continue.
3. Find the line `## Model Context Protocol (MCP) Servers`. After the last
   `###` entry in that section, paste **Snippet 1** (below).
4. Find the line `## SKILL.md`. After the last `###` entry in that section,
   paste **Snippet 2** (below).
5. Scroll down to **Commit changes**. Put the commit title from "PR title"
   below. Choose "Create a new branch and start a pull request", name the branch
   e.g. `add-xrpname-ai-tools`, click **Propose changes**.
6. On the next screen, paste the "PR description" below and click
   **Create pull request**. Done — now wait for a maintainer to review.

> Tip: keep the PR to just this one file so review is quick. If they ask for a
> tweak, edit the same branch and it updates the PR automatically.

---

## PR title

```
Add XRPName MCP server and x402 domain-registration skill to AI Tools
```

## PR description

```
This adds two XRPName entries to the AI Tools page:

1. MCP Servers — the XRPName MCP server (@xrpname/xrpname-mcp), which exposes
   XRPL domain operations (.xrp / .xrpl / .xrpfi / .rlusd) to AI agents.
2. SKILL.md — the `xrpname-register` skill, which lets an agent buy and register
   a domain end-to-end via the x402 agentic-payment protocol (T54 facilitator).

The skill is proven live on mainnet: an agent registered `xrpl-x402.xrp`
autonomously (x402 Payment → mint → agent-signed NFTokenAcceptOffer, tesSUCCESS).

Repo: https://github.com/XRPDomains/xrpname-mcp-server
npm:  https://www.npmjs.com/package/@xrpname/xrpname-mcp
Info: https://xrpdomains.xyz/agent
```

---

## Snippet 1 — paste under `## Model Context Protocol (MCP) Servers`

```markdown
### XRPName MCP Server

[XRPName](https://xrpdomains.xyz/agent) provides an MCP server
([`@xrpname/xrpname-mcp`](https://www.npmjs.com/package/@xrpname/xrpname-mcp))
that exposes XRP Ledger domain operations (`.xrp`, `.xrpl`, `.xrpfi`, `.rlusd`)
to AI agents: resolve names ↔ addresses, check availability and live pricing,
read portfolios and pending offers, and build domain transactions. It also
exposes an x402 endpoint for agentic domain registration. See the
[GitHub repo](https://github.com/XRPDomains/xrpname-mcp-server) for setup.
```

## Snippet 2 — paste under `## SKILL.md`

```markdown
### XRPName Domain Registration (x402)

The [`xrpname-register`](https://github.com/XRPDomains/xrpname-mcp-server/tree/main/skills/xrpname-register)
skill lets an agent buy and register a root XRPName domain (`.xrp`, `.xrpl`,
`.xrpfi`, `.rlusd`) end-to-end on mainnet using the x402 agentic-payment protocol
via the T54 facilitator: request price (HTTP 402), sign the XRP Payment, then
sign the `NFTokenAcceptOffer` to take custody. No private key ever leaves the
agent. For installation and the full flow, see the
[GitHub repo](https://github.com/XRPDomains/xrpname-mcp-server/tree/main/skills/xrpname-register).
```

---

## What "success" looks like

Once merged, XRPName appears at
https://xrpl.org/resources/dev-tools/ai-tools under both the MCP Servers and
SKILL.md sections — the same page as Context7 and the XRPL Commons skill. That's
the canonical place XRPL developers look for agent tooling.
