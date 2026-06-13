/**
 * Tool registry. Buoc 0 ships 3 read tools; Buoc 1 adds get_portfolio +
 * get_pending_offers; Buoc 4 adds send_signed_tx. Phase 2+ tx-build tools
 * plug in here without touching server core.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Deps } from '../types/deps.js';
import { registerCheckDomains } from './check-domains.js';
import { registerGetDomainProfile } from './get-domain-profile.js';
import { registerCheckTxStatus } from './check-tx-status.js';
import { registerGetPendingOffers } from './get-pending-offers.js';

export function registerAllTools(server: McpServer, deps: Deps): void {
  registerCheckDomains(server, deps);
  registerGetDomainProfile(server, deps);
  registerCheckTxStatus(server, deps);
  // Bước 1
  registerGetPendingOffers(server, deps);
}
