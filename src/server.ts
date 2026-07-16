/**
 * MCP server factory. One McpServer instance per connection/request
 * (stateless HTTP) or per process (stdio).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';
import type { Deps } from './types/deps.js';

export const SERVER_NAME = 'xrpname-mcp';
export const SERVER_VERSION = '0.1.2';

export function createMcpServer(deps: Deps): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerAllTools(server, deps);
  return server;
}
