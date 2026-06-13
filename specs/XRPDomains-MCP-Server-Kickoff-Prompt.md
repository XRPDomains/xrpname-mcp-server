# Task: Build XRPName MCP Server (v1)

You are implementing a brand-new standalone backend service that exposes XRPL domain operations (.xrp / .xrpfi / .xrpl) to AI agents through the Model Context Protocol. Think of it as the XRPL equivalent of sns.id/agent — let any MCP-compatible client (Claude Desktop, Claude Code, Cursor, Custom GPT) discover, register, transfer, and manage XRPL domains through natural conversation.

## Read the spec first

The full specification lives at:

`XRPDomains-MCP-Server-Spec.md`

It is intentionally verbose and structured for AI-pair-programming clarity. Read all 20 sections before writing code. Pay special attention to:

- §4 Architecture — what calls what
- §5 Repo structure — exact folder layout you should scaffold
- §7 OAuth flow — wallet-signature-based auth
- §8 Tool catalog — the 12 tool API surface
- §15 Implementation phases — Phase 1 is your scope
- **§16 Out of scope — these are HARD rules. Do not touch the v3 web app codebase.**
- §17 Open questions — surface these to product before kickoff; do not invent answers

## Reference implementation

The closest analog is SNS for Agents at https://sns.id/agent (and `https://mcp.sns.id/mcp`). Their patterns (build-tx-not-sign, web fallback URLs, OAuth on first use, snake_case tool names with mode suffixes) are the patterns we want to mirror. Look at their tool catalog and copy the structural decisions where they make sense for XRPL.

## Scope of this engagement — Phase 1 MVP

Per §15.1:

- OAuth flow end-to-end
- 5 read tools: `check_domains`, `get_portfolio`, `get_pending_offers`, `get_domain_profile`, `check_tx_status`
- 1 write tool: `send_signed_tx`
- Redis caching + per-user rate limiting
- Health endpoints (`/health`, `/ready`, `/metrics`)
- Smoke test script
- Deploy to staging at `mcp-staging.xrpdomains.xyz`

Phase 2 (tx-build tools), Phase 3 (registration), and Phase 4 (launch) are explicitly **out of scope** for this delivery.

## Tech stack (non-negotiable)

- Node.js 20 LTS, TypeScript 5.4+ strict mode
- `@modelcontextprotocol/sdk` (official Anthropic TS SDK)
- Fastify for HTTP, `xrpl` for XRPL client, `ioredis` for sessions + cache
- `vitest` for tests, ESLint + Prettier
- Docker + docker-compose for deploy

## Critical constraints

1. **No private keys ever touch this server.** The build-tx-not-sign pattern is mandatory.
2. **The MCP server is a pure consumer of the existing xrpdomains.xyz REST API.** No DB access, no new backend endpoints in v1.
3. **Do not modify any file under `XRPDomains/v3/` or anywhere in the web app codebase.** This is a new repo at `xrpname-mcp-server`.
4. **OAuth tokens are scoped per XRPL address.** A token authenticates identity, not signing authority — signing always happens client-side in the user's wallet.
5. **Every TX-related response (Phase 2+) must include a `web_url` fallback** that points to xrpdomains.xyz so users can complete the action in browser if their agent can't drive the wallet.

## Deliverables for this engagement

1. A new Git repo `xrpname-mcp-server` scaffolded per §5
2. Working OAuth flow on staging (`mcp-staging.xrpdomains.xyz/authorize`)
3. All 6 Phase 1 tools implemented and passing the §15.1 acceptance criteria
4. Smoke script that exercises all tools (§14.5)
5. README + docs/ARCHITECTURE.md
6. CI on GitHub Actions (typecheck + test + lint on every PR)
7. Docker image published, staging environment running

## How to start

1. Read the entire spec
2. Reply with the 8 open questions from §17 with your recommended answers — wait for product sign-off before continuing
3. Once answered, post a 1-week + 1-week plan with daily checkpoints
4. Scaffold the repo and OAuth-only smoke (no tools yet) — get staging up first
5. Add tools one by one, each with its own PR

Ask before deviating from the spec. The web app continues evolving in parallel — do not let your MCP work slip into the web codebase.

Reference docs:
- MCP protocol: https://modelcontextprotocol.io/specification
- TS SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Reference impl: https://sns.id/agent
