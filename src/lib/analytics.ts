/**
 * Analytics — persistent, zero-dependency usage stats for the MCP server.
 *
 * Answers: how many connections (installs), from which agents, and how many
 * times each tool was called — bucketed by day so the dashboard can roll up to
 * daily / weekly / monthly. Persists to a JSON file so numbers survive restarts
 * and PM2 redeploys.
 *
 * Privacy: no raw IPs or arguments are stored. A "client" is identified only by
 * a salted SHA-256 hash of (ip + agent), used purely for unique-visitor counts.
 *
 * NOT using a DB on purpose: the volume is small, and a self-contained JSON
 * store keeps the dependency/audit surface tiny (same rationale as metrics.ts).
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const RETENTION_DAYS = 400; // prune day buckets older than this
const MAX_DAY_UNIQUES = 50_000; // cap per-day unique-hash set (file-size guard)
const SAVE_DEBOUNCE_MS = 3_000;

/** One UTC day bucket. Sets are serialized as arrays. */
interface DayBucket {
  connections: number; // initialize calls
  toolCalls: number;
  errors: number;
  tools: Record<string, number>; // tool -> count
  agents: Record<string, number>; // agent name -> count (connections)
  uniques: string[]; // hashed client ids seen this day
}

interface Store {
  version: 1;
  salt: string;
  since: string; // first day (YYYY-MM-DD)
  allTime: { connections: number; toolCalls: number; errors: number };
  agents: Record<string, { connections: number; toolCalls: number }>; // by name
  agentVersions: Record<string, number>; // "name@version" -> connections (detail)
  tools: Record<string, { ok: number; error: number }>;
  methods: Record<string, number>; // jsonrpc method -> count
  days: Record<string, DayBucket>;
}

export interface RecordInput {
  method: string; // jsonrpc method (initialize, tools/list, tools/call, ...)
  tool: string | null; // tool name when method === tools/call
  outcome: 'ok' | 'error';
  agentName?: string | null; // from clientInfo.name (initialize only)
  agentVersion?: string | null; // from clientInfo.version
  ip?: string | null; // real client ip (already extracted from CF/XFF)
}

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function emptyDay(): DayBucket {
  return { connections: 0, toolCalls: 0, errors: 0, tools: {}, agents: {}, uniques: [] };
}

/** Keep label values compact + safe. */
function clean(v: string): string {
  return v.replace(/[\n\r"\\]/g, '_').slice(0, 60);
}

export class Analytics {
  private store: Store;
  private readonly file: string;
  private readonly enabled: boolean;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  // in-memory Set mirror of each day's uniques for O(1) membership
  private uniqueSets = new Map<string, Set<string>>();

  constructor(opts: { file: string; enabled?: boolean } = { file: './data/analytics.json' }) {
    this.file = opts.file;
    this.enabled = opts.enabled ?? true;
    this.store = this.load();
  }

  private load(): Store {
    if (this.enabled && existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Store;
        if (parsed && parsed.version === 1) {
          for (const [day, b] of Object.entries(parsed.days ?? {})) {
            this.uniqueSets.set(day, new Set(b.uniques ?? []));
          }
          return parsed;
        }
      } catch {
        /* corrupt file — start fresh, don't crash the server */
      }
    }
    return {
      version: 1,
      salt: randomBytes(16).toString('hex'),
      since: today(),
      allTime: { connections: 0, toolCalls: 0, errors: 0 },
      agents: {},
      agentVersions: {},
      tools: {},
      methods: {},
      days: {},
    };
  }

  private day(date: string): DayBucket {
    let b = this.store.days[date];
    if (!b) {
      b = emptyDay();
      this.store.days[date] = b;
      this.uniqueSets.set(date, new Set());
    }
    return b;
  }

  private clientHash(ip: string, agent: string): string {
    return createHash('sha256').update(`${this.store.salt}|${ip}|${agent}`).digest('hex').slice(0, 16);
  }

  /** Record a completed request. Safe to call on every /mcp request. */
  record(input: RecordInput): void {
    if (!this.enabled) return;
    const date = today();
    const b = this.day(date);
    const s = this.store;

    // method breakdown (all-time)
    const method = clean(input.method || 'unknown');
    s.methods[method] = (s.methods[method] ?? 0) + 1;

    if (input.outcome === 'error') {
      s.allTime.errors += 1;
      b.errors += 1;
    }

    if (input.method === 'initialize') {
      s.allTime.connections += 1;
      b.connections += 1;

      const name = clean(input.agentName || 'unknown');
      s.agents[name] = s.agents[name] ?? { connections: 0, toolCalls: 0 };
      s.agents[name].connections += 1;
      b.agents[name] = (b.agents[name] ?? 0) + 1;

      const ver = clean(`${name}@${input.agentVersion || '?'}`);
      s.agentVersions[ver] = (s.agentVersions[ver] ?? 0) + 1;

      // unique client (hashed) — for unique-visitor counts
      if (input.ip) {
        const h = this.clientHash(input.ip, name);
        const set = this.uniqueSets.get(date) as Set<string>;
        if (!set.has(h) && set.size < MAX_DAY_UNIQUES) {
          set.add(h);
          b.uniques.push(h);
        }
      }
    }

    if (input.tool) {
      const tool = clean(input.tool);
      s.allTime.toolCalls += 1;
      b.toolCalls += 1;
      b.tools[tool] = (b.tools[tool] ?? 0) + 1;
      s.tools[tool] = s.tools[tool] ?? { ok: 0, error: 0 };
      s.tools[tool][input.outcome] += 1;
      // attribute the call to the agent name if we can't know it here, skip;
      // per-agent tool totals are approximated by connections only.
    }

    this.prune();
    this.scheduleSave();
  }

  private prune(): void {
    const days = Object.keys(this.store.days);
    if (days.length <= RETENTION_DAYS) return;
    days.sort(); // ascending YYYY-MM-DD
    for (const d of days.slice(0, days.length - RETENTION_DAYS)) {
      delete this.store.days[d];
      this.uniqueSets.delete(d);
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
    this.saveTimer.unref?.();
  }

  /** Persist immediately (atomic write). Call on shutdown. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.enabled || !this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.store));
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch {
      /* disk error — keep serving; retry on next record */
    }
  }

  /**
   * JSON snapshot for the dashboard.
   * `detail=false` (public): safe aggregates only.
   * `detail=true` (token): adds per-day tool/agent splits + agent versions.
   */
  snapshot(detail = false): unknown {
    const s = this.store;
    const dayKeys = Object.keys(s.days).sort();
    const series = dayKeys.map((d) => {
      const b = s.days[d] as DayBucket;
      const base: Record<string, unknown> = {
        date: d,
        connections: b.connections,
        toolCalls: b.toolCalls,
        errors: b.errors,
        uniques: b.uniques.length,
      };
      if (detail) {
        base.tools = b.tools;
        base.agents = b.agents;
      }
      return base;
    });

    const toolTotals = Object.entries(s.tools)
      .map(([name, v]) => ({ name, ok: v.ok, error: v.error, total: v.ok + v.error }))
      .sort((a, b) => b.total - a.total);

    const agentTotals = Object.entries(s.agents)
      .map(([name, v]) => ({ name, connections: v.connections }))
      .sort((a, b) => b.connections - a.connections);

    const uniqueLast30 = uniqueOverWindow(this.uniqueSets, 30);

    const out: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      since: s.since,
      totals: {
        connections: s.allTime.connections,
        toolCalls: s.allTime.toolCalls,
        errors: s.allTime.errors,
        uniqueClientsLast30d: uniqueLast30,
        tools: toolTotals.length,
      },
      tools: toolTotals,
      agents: agentTotals,
      series, // daily; dashboard rolls up to weekly/monthly
    };
    if (detail) {
      out.methods = s.methods;
      out.agentVersions = s.agentVersions;
    }
    return out;
  }
}

/** Distinct hashed clients seen across the last `windowDays` day buckets. */
function uniqueOverWindow(sets: Map<string, Set<string>>, windowDays: number): number {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  for (const [day, set] of sets) {
    if (day >= cutoff) for (const h of set) seen.add(h);
  }
  return seen.size;
}
