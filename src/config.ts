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

export interface AnalyticsConfig {
  enabled: boolean;
  file: string;
  /** When set, `/mcp/stats.json?token=…` returns the detailed snapshot. */
  token: string | null;
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
  analytics: AnalyticsConfig;
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
    analytics: {
      enabled: bool(env.MCP_ANALYTICS_ENABLED, true),
      file: env.MCP_ANALYTICS_FILE ?? './data/analytics.json',
      token: env.MCP_STATS_TOKEN ?? null,
    },
  };
}
