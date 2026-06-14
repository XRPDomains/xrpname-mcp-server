/**
 * Minimal JWT (HS256) — §7.3. Zero-dependency mint + verify via node:crypto.
 *
 * Why hand-rolled: we only need one signed-claims format (HS256), and Node's
 * crypto gives us HMAC + constant-time compare for free. This keeps the auth
 * surface small and fully testable offline. Swap for a library only if we move
 * to RS256 / key rotation.
 *
 * Hardened against the classic JWT pitfalls:
 *   - `alg` is pinned to HS256; `none` and any other alg are rejected.
 *   - signature compared with timingSafeEqual (no early-exit leak).
 *   - `exp` (and optional `iss`) are enforced on verify.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  /** Subject — the authenticated XRPL address. */
  sub: string;
  /** Space- or array-delimited scopes. */
  scope?: string;
  /** Optional referral code carried from /authorize?refcode=. */
  refcode?: string | null;
  /** JWT ID for audit/revocation. */
  jti?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  [k: string]: unknown;
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecodeJson(seg: string): Record<string, unknown> {
  const json = Buffer.from(seg, 'base64url').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

function hmac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export interface SignOptions {
  expiresInSec: number;
  issuer?: string;
  /** Override clock for tests. */
  nowSec?: number;
}

/** Mint a signed HS256 token. Adds iat/exp (and iss when provided). */
export function signJwt(claims: JwtClaims, secret: string, opts: SignOptions): string {
  if (!secret) throw new JwtError('Signing secret is empty');
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtClaims = {
    ...claims,
    iat: now,
    exp: now + opts.expiresInSec,
    ...(opts.issuer ? { iss: opts.issuer } : {}),
  };
  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const sig = b64urlEncode(hmac(signingInput, secret));
  return `${signingInput}.${sig}`;
}

export interface VerifyOptions {
  issuer?: string;
  nowSec?: number;
}

/**
 * Verify signature + claims and return the decoded payload.
 * Throws JwtError on any problem (bad format, wrong alg, bad signature,
 * expired, or issuer mismatch).
 */
export function verifyJwt(token: string, secret: string, opts: VerifyOptions = {}): JwtClaims {
  if (!secret) throw new JwtError('Verification secret is empty');
  if (typeof token !== 'string') throw new JwtError('Token is not a string');

  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('Malformed token (expected 3 segments)');
  const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string];

  let header: Record<string, unknown>;
  let payload: JwtClaims;
  try {
    header = b64urlDecodeJson(headerSeg);
    payload = b64urlDecodeJson(payloadSeg) as JwtClaims;
  } catch {
    throw new JwtError('Token segments are not valid base64url JSON');
  }

  if (header.alg !== 'HS256') throw new JwtError(`Unsupported alg "${String(header.alg)}" (only HS256)`);

  const expected = hmac(`${headerSeg}.${payloadSeg}`, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(sigSeg, 'base64url');
  } catch {
    throw new JwtError('Signature is not valid base64url');
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new JwtError('Signature mismatch');
  }

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || now >= payload.exp) {
    throw new JwtError('Token expired');
  }
  if (opts.issuer && payload.iss !== opts.issuer) {
    throw new JwtError('Issuer mismatch');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new JwtError('Token missing subject');
  }
  return payload;
}
