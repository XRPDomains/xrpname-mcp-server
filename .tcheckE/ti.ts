/**
 * Cache invalidation after a successful send_signed_tx (§12.3 / §invalidation
 * table). A domain transfer/accept/cancel/burn changes portfolio + pending
 * views, so we drop the stale cache keys for the affected addresses instead of
 * waiting out the (short) TTL.
 *
 * The signed blob only carries what XRPL encodes — Account, Destination,
 * NFTokenID — not domain names or the counterparty on an accept. So this is a
 * best-effort invalidation of the keys we CAN derive (the signer's, and the
 * directed Destination's, portfolio + pending). Anything else self-heals via TTL
 * (portfolio 30s, pending 10s, getAddress 60s).
 *
 * Cache-key shapes (must match the client):
 *   portfolio: `mcp:getAllNames:<address>:all`
 *   pending:   `mcp:getPendingDomains:<address>`
 */

const NFTOKEN_TYPES = new Set([
  'NFTokenCreateOffer',
  'NFTokenAcceptOffer',
  'NFTokenCancelOffer',
  'NFTokenBurn',
]);

/**
 * Given a decoded transaction, return the cache keys to invalidate.
 * Returns [] for tx types we don't cache-touch. Exported for unit testing.
 */
export function cacheKeysToInvalidate(tx: Record<string, unknown>): string[] {
  const type = typeof tx.TransactionType === 'string' ? tx.TransactionType : '';
  if (!NFTOKEN_TYPES.has(type)) return [];

  const keys = new Set<string>();
  const account = typeof tx.Account === 'string' ? tx.Account : null;
  const destination = typeof tx.Destination === 'string' ? tx.Destination : null;

  if (account) {
    keys.add(`mcp:getAllNames:${account}:all`);
    keys.add(`mcp:getPendingDomains:${account}`);
  }
  // A directed offer (transfer) also changes the recipient's pending view.
  if (destination) {
    keys.add(`mcp:getPendingDomains:${destination}`);
    keys.add(`mcp:getAllNames:${destination}:all`);
  }

  return [...keys];
}
