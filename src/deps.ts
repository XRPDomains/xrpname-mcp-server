/**
 * Builds the shared dependency container.
 */
import { loadConfig, type Config } from './config.js';
import { createCache } from './clients/cache.js';
import { XrpDomainsApi } from './clients/xrpdomains-api.js';
import { XrplClient } from './clients/xrpl-client.js';
import type { Deps } from './types/deps.js';

export function buildDeps(config: Config = loadConfig()): Deps {
  const cache = createCache(config.redisUrl);
  const api = new XrpDomainsApi(config.apiBase, cache);
  const xrpl = new XrplClient(config.xrplWssUrl);
  return {
    config,
    cache,
    api,
    xrpl,
    // Buoc 0-2: DEV_ADDRESS stands in for the OAuth-authenticated address.
    authAddress: config.devAddress,
  };
}

export async function closeDeps(deps: Deps): Promise<void> {
  await Promise.allSettled([deps.cache.close(), deps.xrpl.close()]);
}
