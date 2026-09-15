/**
 * gateway-registry.ts — x402 Gateway (Phase 1) project registry.
 *
 * Multi-tenant, non-custodial: each project declares WHERE funds go (payTo) and
 * HOW MUCH (price). Payments settle payer → payTo directly; the gateway never
 * holds funds or keys. Phase 1 is pay-only (XRP). Backed by a JSON file now; a
 * dashboard will write the same file/DB later.
 */
import { readFileSync } from 'node:fs';

/** XRP, or an issued currency (IOU) — Phase 1 uses XRP; the type allows IOU later. */
export type GatewayAsset = { code: 'XRP' } | { code: string; issuer: string };

export type GatewayPrice =
  | { mode: 'fixed'; amount: number } // fixed price (human units)
  | { mode: 'range'; min: number; max: number }; // payer chooses (e.g. tips)

export interface GatewayProject {
  projectId: string;
  name: string;
  /** Recipient wallet — funds settle here directly. */
  payTo: string;
  asset: GatewayAsset;
  price: GatewayPrice;
  active: boolean;
  /** Optional resource/redirect returned after a successful payment. */
  successUrl?: string;
  /** Optional per-project XRPL SourceTag (attribution); falls back to the gateway default. */
  sourceTag?: number;
}

export interface GatewayRegistry {
  get(projectId: string): GatewayProject | null;
  all(): GatewayProject[];
}

/** File-backed registry with a small in-memory TTL cache (re-reads every 30s). */
export function loadGatewayRegistry(file: string): GatewayRegistry {
  let cache: Map<string, GatewayProject> | null = null;
  let loadedAt = 0;
  const TTL_MS = 30_000;

  function load(): Map<string, GatewayProject> {
    const now = Date.now();
    if (cache && now - loadedAt < TTL_MS) return cache;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { projects?: GatewayProject[] };
      const m = new Map<string, GatewayProject>();
      for (const p of raw.projects ?? []) if (p && typeof p.projectId === 'string') m.set(p.projectId, p);
      cache = m;
      loadedAt = now;
      return m;
    } catch {
      // Missing/invalid file → empty registry (endpoints return PROJECT_NOT_FOUND).
      cache = cache ?? new Map();
      loadedAt = now;
      return cache;
    }
  }

  return {
    get: (id) => load().get(id) ?? null,
    all: () => [...load().values()],
  };
}
