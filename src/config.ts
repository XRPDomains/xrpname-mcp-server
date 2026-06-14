/**
 * Env loader + validation. All runtime config flows through here.
 * Spec ref: §13.2
 */
import 'dotenv/config';

export interface RateLimitConfig {
  enabled: boolean;
  readPerWindow: number;
  unauthPerWindow: number;
  windowSec: number;
}

export interface Config {
  apiBase: string;
  xrplWssUrl: string;
  treasuryAddress: string;
  basePriceXrp: number;
  discountPercent: number;
  redisUrl: string | null;
  devAddress: string | null;
  logLevel: string;
  port: number;
  webBase: string;
  rateLimit: RateLimitConfig;
  /** HS256 signing secret for access tokens (§7.3). null → auth disabled (dev). */
  oauthJwtSecret: string | null;
  oauthIssuer: string;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiBase: env.XRPDOMAINS_API_BASE ?? 'https://xrpdomains.xyz',
    xrplWssUrl: env.XRPL_WSS_URL ?? 'wss://xrplcluster.com',
    treasuryAddress: env.XRPDOMAINS_TREASURY_ADDRESS ?? 'raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9',
    basePriceXrp: num(env.PRICING_BASE_PRICE_XRP, 10),
    discountPercent: num(env.PRICING_DISCOUNT_PERCENT, 50),
    redisUrl: env.REDIS_URL ?? null,
    devAddress: env.DEV_ADDRESS ?? null,
    logLevel: env.LOG_LEVEL ?? 'info',
    port: num(env.PORT, 3000),
    webBase: env.XRPDOMAINS_WEB_BASE ?? 'https://xrpdomains.xyz',
    rateLimit: {
      enabled: bool(env.RATE_LIMIT_ENABLED, true),
      readPerWindow: num(env.RATE_LIMIT_READ_PER_MIN, 60),
      unauthPerWindow: num(env.RATE_LIMIT_UNAUTH_PER_MIN, 30),
      windowSec: num(env.RATE_LIMIT_WINDOW_SEC, 60),
    },
    oauthJwtSecret: env.OAUTH_JWT_SECRET ?? null,
    oauthIssuer: env.OAUTH_ISSUER ?? 'https://mcp.xrpdomains.xyz',
  };
}
