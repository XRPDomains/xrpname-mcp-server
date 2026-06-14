import { describe, it, expect } from 'vitest';
import { resolveBearer } from '../../src/lib/auth.js';
import { signJwt } from '../../src/lib/jwt.js';
import { McpToolError } from '../../src/lib/errors.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const ISS = 'https://mcp.xrpdomains.xyz';
const SUB = 'rLhi87aSCyNW88tW4632yLiwinbghFZNue';

describe('resolveBearer', () => {
  it('returns null when no header is present (anonymous)', () => {
    expect(resolveBearer(undefined, SECRET, ISS)).toBeNull();
    expect(resolveBearer('', SECRET, ISS)).toBeNull();
  });

  it('resolves a valid token to an AuthContext', () => {
    const token = signJwt(
      { sub: SUB, scope: 'domains', refcode: 'REF1', jti: 'jti-1' },
      SECRET,
      { expiresInSec: 3600, issuer: ISS },
    );
    const ctx = resolveBearer(`Bearer ${token}`, SECRET, ISS);
    expect(ctx).toEqual({ address: SUB, scopes: ['domains'], refcode: 'REF1', tokenJti: 'jti-1' });
  });

  it('throws on a malformed Authorization header', () => {
    expect(() => resolveBearer('Token abc', SECRET, ISS)).toThrow(McpToolError);
  });

  it('throws WALLET_NOT_AUTHENTICATED on an invalid token', () => {
    const token = signJwt({ sub: SUB }, 'wrong-secret', { expiresInSec: 3600, issuer: ISS });
    try {
      resolveBearer(`Bearer ${token}`, SECRET, ISS);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(McpToolError);
      expect((e as McpToolError).code).toBe('WALLET_NOT_AUTHENTICATED');
    }
  });

  it('parses array and missing scopes', () => {
    const t1 = signJwt({ sub: SUB, scope: 'domains marketplace:read' }, SECRET, { expiresInSec: 3600, issuer: ISS });
    expect(resolveBearer(`Bearer ${t1}`, SECRET, ISS)?.scopes).toEqual(['domains', 'marketplace:read']);
    const t2 = signJwt({ sub: SUB }, SECRET, { expiresInSec: 3600, issuer: ISS });
    expect(resolveBearer(`Bearer ${t2}`, SECRET, ISS)?.scopes).toEqual([]);
  });
});
