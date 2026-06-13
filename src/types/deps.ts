import type { Config } from '../config.js';
import type { Cache } from '../clients/cache.js';
import type { XrpDomainsApi } from '../clients/xrpdomains-api.js';
import type { XrplClient } from '../clients/xrpl-client.js';

/**
 * Dependency container passed to every tool registration.
 * `authAddress` is the authenticated XRPL address:
 *  - Buoc 0-2: DEV_ADDRESS from env (local testing)
 *  - Buoc 3+: resolved from OAuth JWT `sub` per request
 */
export interface Deps {
  config: Config;
  cache: Cache;
  api: XrpDomainsApi;
  xrpl: XrplClient;
  authAddress: string | null;
}
