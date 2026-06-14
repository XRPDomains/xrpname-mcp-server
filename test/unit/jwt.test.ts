import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt, JwtError } from '../../src/lib/jwt.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const SUB = 'rLhi87aSCyNW88tW4632yLiwinbghFZNue';

describe('signJwt / verifyJwt', () => {
  it('round-trips claims', () => {
    const t = signJwt({ sub: SUB, scope: 'domains', jti: 'abc' }, SECRET, { expiresInSec: 3600 });
    const claims = verifyJwt(t, SECRET);
    expect(claims.sub).toBe(SUB);
    expect(claims.scope).toBe('domains');
    expect(claims.jti).toBe('abc');
    expect(claims.exp).toBeGreaterThan(claims.iat as number);
  });

  it('rejects a tampered payload', () => {
    const t = signJwt({ sub: SUB }, SECRET, { expiresInSec: 3600 });
    const [h, , s] = t.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'rEvil', exp: 9999999999 })).toString('base64url')}.${s}`;
    expect(() => verifyJwt(forged, SECRET)).toThrow(JwtError);
  });

  it('rejects the wrong secret', () => {
    const t = signJwt({ sub: SUB }, SECRET, { expiresInSec: 3600 });
    expect(() => verifyJwt(t, 'other-secret')).toThrow(/Signature mismatch/);
  });

  it('rejects an expired token', () => {
    const t = signJwt({ sub: SUB }, SECRET, { expiresInSec: 60, nowSec: 1000 });
    expect(() => verifyJwt(t, SECRET, { nowSec: 2000 })).toThrow(/expired/);
  });

  it('blocks the alg=none confusion attack', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: SUB, exp: 9999999999 })).toString('base64url');
    expect(() => verifyJwt(`${header}.${payload}.`, SECRET)).toThrow(/Unsupported alg/);
  });

  it('enforces issuer when requested', () => {
    const t = signJwt({ sub: SUB }, SECRET, { expiresInSec: 3600, issuer: 'https://mcp.xrpdomains.xyz' });
    expect(verifyJwt(t, SECRET, { issuer: 'https://mcp.xrpdomains.xyz' }).iss).toBe('https://mcp.xrpdomains.xyz');
    expect(() => verifyJwt(t, SECRET, { issuer: 'https://evil.example' })).toThrow(/Issuer mismatch/);
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyJwt('not.a.jwt.token', SECRET)).toThrow(JwtError);
    expect(() => verifyJwt('only-one-part', SECRET)).toThrow(/3 segments/);
  });
});
