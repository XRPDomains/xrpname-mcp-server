/**
 * Resolve the signing wallet for a *_tx tool: an explicit `account` input, or
 * the authenticated/dev address (deps.authAddress). Throws if neither is usable.
 *
 * Until OAuth (Phase 3 Stage B) is wired end-to-end, callers may pass `account`
 * explicitly; afterwards it defaults to the token's address.
 */
import { isValidClassicAddress } from 'xrpl';
import { McpToolError } from '../lib/errors.js';
import type { Deps } from '../types/deps.js';

export function resolveSigner(accountInput: string | undefined, deps: Deps): string {
  const account = accountInput?.trim() || deps.authAddress;
  if (!account) {
    throw new McpToolError(
      'WALLET_NOT_AUTHENTICATED',
      'No signing address available — pass `account` (your r... address) or authenticate first.',
    );
  }
  if (!isValidClassicAddress(account)) {
    throw new McpToolError('INVALID_INPUT', `"${account}" is not a valid XRPL classic address.`);
  }
  return account;
}
