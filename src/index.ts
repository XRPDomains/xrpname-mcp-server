/**
 * HTTP entrypoint — Fastify + MCP Streamable HTTP transport (stateless).
 * Endpoints:
 *   POST /mcp     — JSON-RPC (initialize / tools/list / tools/call), rate-limited
 *   GET  /health  — liveness (Redis optional + XRPL reachability)
 *   GET  /ready   — readiness
 *   GET  /metrics — Prometheus exposition (§13.3)
 *
 * Stateless pattern: a fresh McpServer + transport per request, so no
 * session affinity is needed behind a load balancer. OAuth (Buoc 3) will
 * hook in as a Fastify preHandler that resolves Bearer → authAddress.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pino } from 'pino';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { buildDeps, closeDeps } from './deps.js';
import { loadConfig } from './config.js';
import { metrics } from './lib/metrics.js';
import { checkRateLimit, resolveLimit } from './lib/rate-limit.js';
import { Analytics } from './lib/analytics.js';
import { STATS_HTML } from './lib/stats-page.js';

/** Parsed view of a JSON-RPC body used by both metrics and analytics. */
interface ParsedReq {
  method: string;
  tool: string | null;
  agentName: string | null;
  agentVersion: string | null;
}

function parseReq(body: unknown): ParsedReq {
  const b = body as
    | { method?: unknown; params?: { name?: unknown; clientInfo?: { name?: unknown; version?: unknown } } }
    | undefined;
  const method = typeof b?.method === 'string' ? b.method : 'unknown';
  const tool = method === 'tools/call' && typeof b?.params?.name === 'string' ? b.params.name : null;
  const ci = method === 'initialize' ? b?.params?.clientInfo : undefined;
  return {
    method,
    tool,
    agentName: typeof ci?.name === 'string' ? ci.name : null,
    agentVersion: typeof ci?.version === 'string' ? ci.version : null,
  };
}

/** Metrics label: tool name for tools/call, else the method. */
function requestLabel(p: ParsedReq): string {
  return p.tool ?? p.method;
}

/** Real client IP behind Cloudflare/IIS reverse proxy. */
function clientIp(req: { headers: Record<string, unknown>; ip: string }): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return (xff.split(',')[0] ?? '').trim() || req.ip;
  return req.ip;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const deps = buildDeps(config);
  const analytics = new Analytics({ file: config.analytics.file, enabled: config.analytics.enabled });

  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
    exposedHeaders: ['Mcp-Session-Id'],
  });

  app.post('/mcp', async (req, reply) => {
    const parsed = parseReq(req.body);
    // Rate limit (§12.1) — keyed by DEV_ADDRESS when set, else by IP.
    if (config.rateLimit.enabled) {
      const { key, limit } = resolveLimit(config.rateLimit, deps.authAddress, req.ip);
      const rl = await checkRateLimit(deps.cache, key, limit, config.rateLimit.windowSec);
      reply.header('RateLimit-Limit', String(rl.limit));
      reply.header('RateLimit-Remaining', String(rl.remaining));
      reply.header('RateLimit-Reset', String(rl.resetSec));
      if (!rl.allowed) {
        metrics.recordRequest(requestLabel(parsed), 'error', 0);
        analytics.record({ method: parsed.method, tool: parsed.tool, outcome: 'error' });
        return reply
          .code(429)
          .header('Retry-After', String(rl.retryAfterSec))
          .send({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Too many requests — try again in ${rl.retryAfterSec} seconds`,
            },
            id: null,
          });
      }
    }

    // Stateless: new server + transport per request.
    const startMs = Date.now();
    const label = requestLabel(parsed);
    const ip = clientIp(req);
    let outcome: 'ok' | 'error' = 'ok';
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
      reply.raw.on('close', () => {
        metrics.recordRequest(label, outcome, (Date.now() - startMs) / 1000);
        analytics.record({
          method: parsed.method,
          tool: parsed.tool,
          outcome,
          agentName: parsed.agentName,
          agentVersion: parsed.agentVersion,
          ip,
        });
        void transport.close();
        void server.close();
      });
    } catch (err) {
      outcome = 'error';
      metrics.recordRequest(label, 'error', (Date.now() - startMs) / 1000);
      analytics.record({
        method: parsed.method,
        tool: parsed.tool,
        outcome: 'error',
        agentName: parsed.agentName,
        agentVersion: parsed.agentVersion,
        ip,
      });
      logger.error({ err }, 'mcp request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          }),
        );
      }
    }
  });

  // Stateless mode: GET (SSE notifications) and DELETE (session teardown)
  // are not applicable — respond 405 per MCP spec guidance.
  const methodNotAllowed = async (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.code(405).send({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed in stateless mode' },
      id: null,
    });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  app.get('/health', async (_req, reply) => {
    const xrplOk = await deps.xrpl.isReachable();
    const status = xrplOk ? 200 : 503;
    return reply.code(status).send({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      xrpl: xrplOk ? 'ok' : 'unreachable',
      uptime_s: Math.round(process.uptime()),
    });
  });

  app.get('/ready', async (_req, reply) => reply.code(200).send({ ready: true }));

  // Prometheus exposition (§13.3). text/plain; version 0.0.4 is the standard
  // content type scrapers expect.
  app.get('/metrics', async (_req, reply) =>
    reply
      .code(200)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(metrics.render()),
  );

  // --- Usage dashboard (reachable via the existing /mcp reverse-proxy rule) ---
  // JSON feed: public summary, or detailed when ?token= matches MCP_STATS_TOKEN.
  app.get('/mcp/stats.json', async (req, reply) => {
    const token = (req.query as { token?: unknown } | undefined)?.token;
    const detail = Boolean(config.analytics.token) && token === config.analytics.token;
    return reply
      .code(200)
      .header('Cache-Control', 'no-store')
      .header('Access-Control-Allow-Origin', '*')
      .send(analytics.snapshot(detail));
  });
  // Lightweight HTML dashboard.
  app.get('/mcp/stats', async (_req, reply) =>
    reply.code(200).header('Content-Type', 'text/html; charset=utf-8').send(STATS_HTML),
  );

  const shutdown = async () => {
    logger.info('shutting down');
    analytics.flush();
    await app.close();
    await closeDeps(deps);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info({ port: config.port }, `${SERVER_NAME} v${SERVER_VERSION} listening`);
}

main().catch((err) => {
  console.error('[xrpname-mcp] fatal:', err);
  process.exit(1);
});
