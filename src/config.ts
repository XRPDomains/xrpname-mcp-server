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

export interface RegistrationConfig {
  /** Platform contract wallet — mints from here AND is the Payment destination.
   *  Defaults to the treasury address; override if networks-mainnet.js differs. */
  contractAddress: string;
  /** NFT metadata endpoint prefix used to build the NFT URI. */
  nftBaseUri: string;
  network: 'MAINNET' | 'TESTNET';
}

export interface X402Config {
  /** Money path — OFF by default until a testnet dry-run validates the flow. */
  enabled: boolean;
  /** T54 facilitator base URL (verify + settle). */
  facilitatorUrl: string;
  /** SourceTag stamped on the x402 Payment (attribution). */
  sourceTag: number;
  /** TEST ONLY — force a fixed XRP price (e.g. 0.1) for a cheap live run.
   *  0/unset = use real pricing. NOTE: backend re-verifies the paid amount
   *  against pricing.json, so this only works if the backend agrees too. */
  testPriceXrp: number;
}

export interface GatewayConfig {
  /** x402 Gateway (Phase 1, pay-only, multi-tenant). */
  enabled: boolean;
  /** JSON file of project configs (payTo + price). A dashboard writes it later. */
  projectsFile: string;
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
  registration: RegistrationConfig;
  x402: X402Config;
  gateway: GatewayConfig;
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
  const treasury = env.XRPDOMAINS_TREASURY_ADDRESS ?? 'raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9';
  return {
    apiBase: env.XRPDOMAINS_API_BASE ?? 'https://xrpdomains.xyz',
    xrplWssUrl: env.XRPL_WSS_URL ?? 'wss://xrplcluster.com',
    treasuryAddress: treasury,
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
    registration: {
      contractAddress: env.XRPDOMAINS_CONTRACT_ADDRESS ?? treasury,
      nftBaseUri:
        env.XRPDOMAINS_NFT_BASE_URI ?? 'https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/',
      network: env.XRPDOMAINS_NETWORK === 'TESTNET' ? 'TESTNET' : 'MAINNET',
    },
    x402: {
      // Gateway ON, REAL pricing (from pricing.json). testPriceXrp=0 means "use
      // real price"; set X402_TEST_PRICE_XRP>0 only for a cheap throwaway test run.
      enabled: bool(env.X402_ENABLED, true),
      facilitatorUrl: env.X402_FACILITATOR_URL ?? 'https://xrpl-facilitator-mainnet.t54.ai',
      sourceTag: num(env.X402_SOURCE_TAG, 804681468),
      testPriceXrp: num(env.X402_TEST_PRICE_XRP, 0),
    },
    gateway: {
      enabled: bool(env.GATEWAY_ENABLED, true),
      projectsFile: env.GATEWAY_PROJECTS_FILE ?? './data/gateway-projects.json',
    },
  };
}
