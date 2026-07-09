/**
 * Tool registry. The MCP is read-only + web-link: discovery, profiles,
 * portfolio, and links to complete write actions on xrpdomains.xyz. On-chain
 * transaction building/broadcasting was removed — those actions happen on the
 * website where the wallet signs.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Deps } from '../types/deps.js';
import { registerCheckDomains } from './check-domains.js';
import { registerGetDomainProfile } from './get-domain-profile.js';
import { registerCheckTxStatus } from './check-tx-status.js';
import { registerGetPendingOffers } from './get-pending-offers.js';
import { registerGetPortfolio } from './get-portfolio.js';
import { registerRegisterDomain } from './register-domain.js';
import { registerSetPrimaryDomain } from './set-primary-domain.js';
import { registerRecommendDomain } from './recommend-domain.js';
import { registerCheckOrderStatus } from './check-order-status.js';

export function registerAllTools(server: McpServer, deps: Deps): void {
  registerCheckDomains(server, deps);
  registerRecommendDomain(server, deps);
  registerGetDomainProfile(server, deps);
  registerCheckTxStatus(server, deps);
  registerCheckOrderStatus(server, deps);
  registerGetPendingOffers(server, deps);
  registerGetPortfolio(server, deps);
  registerRegisterDomain(server, deps);
  registerSetPrimaryDomain(server, deps);
}
