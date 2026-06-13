/**
 * stdio entrypoint — for local installs in Claude Code / Claude Desktop / Codex:
 *   claude mcp add xrpname -- node <repo>/dist/stdio.js
 *
 * IMPORTANT: stdout is reserved for JSON-RPC. All logs go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { buildDeps, closeDeps } from './deps.js';

async function main(): Promise<void> {
  const deps = buildDeps();
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[xrpname-mcp] stdio server running');

  const shutdown = async () => {
    await closeDeps(deps);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[xrpname-mcp] fatal:', err);
  process.exit(1);
});
