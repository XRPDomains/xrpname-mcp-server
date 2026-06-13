/**
 * HTTP entrypoint — Fastify + MCP Streamable HTTP transport (stateless).
 * Endpoints:
 *   POST /mcp     — JSON-RPC (initialize / tools/list / tools/call)
 *   GET  /health  — liveness (Redis optional + XRPL reachability)
 *   GET  /ready   — readiness
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

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });
  const deps = buildDeps(config);

  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
    exposedHeaders: ['Mcp-Session-Id'],
  });

  app.post('/mcp', async (req, reply) => {
    // Stateless: new server + transport per request.
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
      reply.raw.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
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

  const shutdown = async () => {
    logger.info('shutting down');
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
