/**
 * Auth resolution — §7.6. Turns an HTTP Authorization header into an
 * AuthContext the tools can trust. Phase 3 Chặng A: token validation only;
 * the /authorize + /token minting flow (Chặng B) issues these tokens.
 */
import { verifyJwt, JwtError } from './jwt.js';
import { McpToolError } from './errors.js';

export interface AuthContext {
  /** Authenticated XRPL address (JWT `sub`). */
  address: string;
  scopes: string[];
  refcode: string | null;
  tokenJti: string | null;
}

/**
 * Resolve a Bearer token to an AuthContext.
 * - Returns `null` when NO token is presented (caller decides: 401 vs dev fallback).
 * - Throws McpToolError('WALLET_NOT_AUTHENTICATED') when a token IS presented
 *   but is invalid/expired — that's an authentication failure, not anonymity.
 */
export function resolveBearer(
  authorizationHeader: string | undefined,
  secret: string,
  issuer: string | undefined,
): AuthContext | null {
  const header = authorizationHeader?.trim();
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new McpToolError('WALLET_NOT_AUTHENTICATED', 'Authorization header must be "Bearer <token>".');
  }
  const token = match[1] as string;

  try {
    const claims = verifyJwt(token, secret, issuer ? { issuer } : {});
    return {
      address: claims.sub,
      scopes: parseScopes(claims.scope),
      refcode: typeof claims.refcode === 'string' ? claims.refcode : null,
      tokenJti: typeof claims.jti === 'string' ? claims.jti : null,
    };
  } catch (err) {
    if (err instanceof JwtError) {
      throw new McpToolError('WALLET_NOT_AUTHENTICATED', `Invalid access token: ${err.message}`);
    }
    throw err;
  }
}

function parseScopes(scope: unknown): string[] {
  if (Array.isArray(scope)) return scope.filter((s): s is string => typeof s === 'string');
  if (typeof scope === 'string') return scope.split(/\s+/).filter(Boolean);
  return [];
}
