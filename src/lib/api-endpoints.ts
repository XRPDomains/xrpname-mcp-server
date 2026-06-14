/**
 * API endpoint registry — SINGLE SOURCE OF TRUTH for every xrpdomains.xyz
 * REST path the server consumes (§10, pure consumer).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The backend path scheme will change in v2 (different prefix and/or different
 * route names / query params). When that happens, edit ONLY this file. The API
 * client, caching, tools and tests call these builders by name, so swapping the
 * underlying paths here never touches running logic.
 *
 * HOW TO MIGRATE TO v2 (later)
 * ----------------------------
 *  1. Add a `v2` entry to ENDPOINT_SETS below with the new prefix / builders.
 *  2. Flip ACTIVE_API_VERSION (or wire it to an env var if you want per-deploy
 *     control) — nothing else changes.
 *  3. Keep `v1` around until every client is migrated, then delete it.
 *
 * Each builder returns the path + querystring RELATIVE to config.apiBase.
 * URL-encoding lives here so it is done in exactly one place.
 */

export type ApiVersion = 'v1' | 'v2';

/** Logical operations the client needs — stable names, version-independent. */
export interface EndpointSet {
  /** Prefix shared by all routes in this version (kept separate so a v2 prefix
   *  change is a one-line edit). */
  readonly prefix: string;
  /** domain → owner + nftoken_id + profile. */
  getAddress(domain: string): string;
  /** address → primary domain string. */
  getName(address: string): string;
  /** address → domains owned by the wallet (portfolio). `page` for Shape B pagination. */
  getAllNames(address: string, page?: number): string;
  /** Incoming offers (address is recipient). */
  getOfferByDestination(address: string): string;
  /** Outgoing offers (address is sender/owner). */
  getOfferByOwner(address: string): string;
}

const enc = encodeURIComponent;

/**
 * v1 — current production scheme on xrpdomains.xyz.
 * Verified against v3/js/v3-nft-tx.js + specs/XRPDomains-API-Audit.md.
 */
const v1Prefix = '/api/xrplnft';
const v1: EndpointSet = {
  prefix: v1Prefix,
  getAddress: (domain) => `${v1Prefix}/getAddress?domain=${enc(domain)}`,
  getName: (address) => `${v1Prefix}/getName?address=${enc(address)}`,
  getAllNames: (address, page) =>
    `${v1Prefix}/getAllNames?address=${enc(address)}${page ? `&page=${page}` : ''}`,
  getOfferByDestination: (address) =>
    `${v1Prefix}/getOfferByDestination?address=${enc(address)}`,
  getOfferByOwner: (address) => `${v1Prefix}/getOfferByOwner?address=${enc(address)}`,
};

/**
 * Registry of every known scheme. Add `v2` here when the backend changes.
 * Example skeleton (uncomment + adjust when v2 lands):
 *
 *   const v2Prefix = '/api/v2/names';
 *   const v2: EndpointSet = {
 *     prefix: v2Prefix,
 *     getAddress: (domain) => `${v2Prefix}/resolve?name=${enc(domain)}`,
 *     ...
 *   };
 */
const ENDPOINT_SETS: Partial<Record<ApiVersion, EndpointSet>> = {
  v1,
  // v2,
};

/** Which scheme the server uses right now. Bump this to switch versions. */
export const ACTIVE_API_VERSION: ApiVersion = 'v1';

/**
 * Resolve the endpoint set for a version (defaults to the active one).
 * Throws if a requested version isn't registered, so a bad switch fails loudly
 * at startup rather than silently hitting wrong paths.
 */
export function getEndpoints(version: ApiVersion = ACTIVE_API_VERSION): EndpointSet {
  const set = ENDPOINT_SETS[version];
  if (!set) {
    throw new Error(`No API endpoint set registered for version "${version}"`);
  }
  return set;
}

/** The active endpoint set, ready to use directly. */
export const ApiEndpoints: EndpointSet = getEndpoints();
