/**
 * Analytics — persistent, zero-dependency usage stats for the MCP server.
 *
 * Answers: how many connections (installs), from which agents, and how many
 * times each tool was called — bucketed by day so the dashboard can roll up to
 * daily / weekly / monthly. Persists to a JSON file so numbers survive restarts
 * and PM2 redeploys.
 *
 * Privacy: no raw IPs are stored — a "client" is identified only by a salted
 * SHA-256 hash of (ip + agent) for unique-visitor counts. The recent-calls log
 * keeps tool arguments (public read-only queries) with XRPL addresses shortened
 * to `rXXXX…XXXX` and each entry truncated.
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
const AGENT_TTL_MS = 6 * 60 * 60 * 1000; // link a tools/call to an initialize from the same IP within 6h
const MAX_IP_MAP = 20_000; // bound the in-memory ip→agent map
const RECENT_MAX = 50; // ring buffer size for the recent-calls log
const ARGS_MAX_CHARS = 300; // truncate stored tool arguments
const X402_RECENT_MAX = 25; // ring buffer size for the x402 activity log
const AUDIT_MAX = 40; // ring buffer size for the per-request audit trail

// The real XRPName tools (mirrors src/tools/index.ts). The public dashboard only
// shows these — scanner-injected names (run_shell, delete_user, __probe…) are
// recorded but filtered out of tools / recent / audit so the page isn't misleading.
const KNOWN_TOOLS = new Set([
  'check_domains',
  'recommend_domain',
  'get_domain_profile',
  'check_tx_status',
  'check_order_status',
  'get_pending_offers',
  'get_portfolio',
  'resolve_address',
  'register_domain',
  'set_primary_domain',
]);

// Directory crawlers / health probes that only `initialize` + `tools/list` to
// index or monitor the server — NOT real end-user clients. Kept out of the
// "real usage" numbers so Codex/Claude/Antigravity traffic is legible.
const PROBE_NAMES = new Set([
  'glama',
  'glimind-probe',
  'mcplookup.com-probe',
  'agentage-mcp-catalog-health',
  'agent-tools.cloud',
  'sasame-audit',
]);
const PROBE_PATTERNS = [
  /probe/i,
  /crawler?/i,
  /scanner?/i,
  /audit/i,
  /health/i,
  /catalog/i,
  /uptime/i,
  /monitor/i,
  /lookup/i,
  /-bot\b/i,
  /inspector/i,
];

/** 'client' = real end-user MCP app; 'probe' = directory crawler / health check. */
export function classifyAgent(name: string): 'client' | 'probe' {
  const n = (name || '').toLowerCase();
  if (n === 'unknown') return 'probe';
  if (PROBE_NAMES.has(n)) return 'probe';
  return PROBE_PATTERNS.some((p) => p.test(n)) ? 'probe' : 'client';
}

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
  // client-identity links (ip / "ua:<hash>") → agent, persisted so tools/call can
  // be attributed to the initialize's client even across server restarts.
  links: Record<string, { name: string; ts: number }>;
  // ring buffer of the most recent tool calls (newest last). Includes the
  // arguments sent in, so it's only exposed in the token-gated detail view.
  recent: RecentCall[];
  // x402 on-chain activity (settled payments). Public-safe: tx hashes are
  // on-ledger, payer is shortened. Optional for back-compat with older files.
  x402?: X402Stats;
  // per-request audit trail (one row per request): opaque client id, action,
  // x402 terms, state (tx / refusal / ok), token estimate, tamper-evident hash.
  audit?: AuditEntry[];
}

export interface AuditEntry {
  ts: number;
  cid: string; // opaque, salted client id (no PII)
  action: string; // tool name, or "x402 register" / "x402 pay"
  terms: string | null; // x402: "<amount> XRP → <payToShort>"; else null
  state: string; // 'ok' | 'error' | 'tx:<hash>' | 'refused:<reason>'
  tokens: number | null; // rough token estimate for the call (null for x402)
  hash: string; // short sha256 digest over the recorded fields (tamper-evident)
}

interface X402Stats {
  payments: number; // settled x402 payments (register mints + gateway pays)
  xrpDrops: number; // cumulative XRP volume in drops (integer, no float drift)
  minted: number; // successful domain mints via x402
  recent: X402Event[];
  regs?: number; // register payments
  pays?: number; // gateway pay payments
  payers?: string[]; // distinct payer short-addresses (bounded)
  days?: Record<string, number>; // YYYY-MM-DD -> drops settled that day
}

export interface X402Event {
  ts: number;
  kind: 'register' | 'pay';
  item: string; // domain (register) or projectId (pay)
  amountXrp: number;
  payer: string; // shortened rXXXX…XXXX
  tx: string; // settled payment tx hash (public on-ledger)
  mintTx: string | null;
}

export interface RecentCall {
  ts: number; // epoch ms
  tool: string;
  agent: string | null; // attributed client, if known
  outcome: 'ok' | 'error';
  args: string; // compact JSON of the tool arguments (truncated)
}

export interface RecordInput {
  method: string; // jsonrpc method (initialize, tools/list, tools/call, ...)
  tool: string | null; // tool name when method === tools/call
  outcome: 'ok' | 'error';
  agentName?: string | null; // from clientInfo.name (initialize only)
  agentVersion?: string | null; // from clientInfo.version
  ip?: string | null; // real client ip (already extracted from CF/XFF)
  ua?: string | null; // User-Agent header (secondary attribution key)
  args?: unknown; // tool arguments (tools/call only) — for the recent-calls log
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

/** Shorten XRPL classic addresses (r...) to `rXXXX…XXXX` for display. */
function shortenAddresses(s: string): string {
  return s.replace(/r[1-9A-HJ-NP-Za-km-z]{24,34}/g, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`);
}

/** Compact + length-limited JSON of tool arguments for the recent-calls log. */
function compactArgs(args: unknown): string {
  if (args === undefined || args === null) return '';
  let s: string;
  try {
    s = typeof args === 'string' ? args : JSON.stringify(args);
  } catch {
    s = String(args);
  }
  s = shortenAddresses(s.replace(/\s+/g, ' ').trim());
  return s.length > ARGS_MAX_CHARS ? s.slice(0, ARGS_MAX_CHARS) + '…' : s;
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
          parsed.links = parsed.links ?? {}; // back-compat with pre-links files
          parsed.recent = parsed.recent ?? [];
          parsed.x402 = parsed.x402 ?? { payments: 0, xrpDrops: 0, minted: 0, recent: [] };
          parsed.audit = parsed.audit ?? [];
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
      links: {},
      recent: [],
      x402: { payments: 0, xrpDrops: 0, minted: 0, recent: [] },
      audit: [],
    };
  }

  /** Opaque, salted client id (no PII) from ip+ua. */
  private cidFor(ip?: string | null, ua?: string | null): string {
    const basis = (ip || '') + '|' + (ua || '');
    if (!ip && !ua) return 'c_anon';
    return 'c_' + createHash('sha256').update(this.store.salt + '|' + basis).digest('hex').slice(0, 8);
  }

  /** Short, salted digest over the recorded audit fields (tamper-evident). */
  private auditHash(parts: string): string {
    return createHash('sha256').update(this.store.salt + '|' + parts).digest('hex').slice(0, 12);
  }

  private pushAudit(e: AuditEntry): void {
    const arr = (this.store.audit = this.store.audit ?? []);
    arr.push(e);
    if (arr.length > AUDIT_MAX) arr.splice(0, arr.length - AUDIT_MAX);
  }

  /** Stable short key for a User-Agent (avoids storing raw UA strings). */
  private uaKey(ua: string): string {
    return 'ua:' + createHash('sha256').update(ua).digest('hex').slice(0, 16);
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
      // remember which agent this client (ip + UA) is, to attribute later tool
      // calls. Persisted in the store so it survives restarts.
      const now = Date.now();
      if (Object.keys(s.links).length >= MAX_IP_MAP) s.links = {};
      if (input.ip) s.links[input.ip] = { name, ts: now };
      if (input.ua) s.links[this.uaKey(input.ua)] = { name, ts: now };
    }

    if (input.tool) {
      const tool = clean(input.tool);
      s.allTime.toolCalls += 1;
      b.toolCalls += 1;
      b.tools[tool] = (b.tools[tool] ?? 0) + 1;
      s.tools[tool] = s.tools[tool] ?? { ok: 0, error: 0 };
      s.tools[tool][input.outcome] += 1;
      // attribute the call to the client's most recent initialize — match by IP
      // first (most specific), then by User-Agent (survives IP changes).
      const now = Date.now();
      const byIp = input.ip ? s.links[input.ip] : undefined;
      const byUa = input.ua ? s.links[this.uaKey(input.ua)] : undefined;
      const linked = byIp && now - byIp.ts < AGENT_TTL_MS ? byIp : byUa && now - byUa.ts < AGENT_TTL_MS ? byUa : undefined;
      if (linked) {
        const a = (s.agents[linked.name] = s.agents[linked.name] ?? { connections: 0, toolCalls: 0 });
        a.toolCalls += 1;
      }
      // recent-calls log (newest last) — args are compacted + addresses shortened
      s.recent.push({
        ts: now,
        tool,
        agent: linked ? linked.name : null,
        outcome: input.outcome,
        args: compactArgs(input.args),
      });
      if (s.recent.length > RECENT_MAX) s.recent.splice(0, s.recent.length - RECENT_MAX);

      // audit trail — one row per tool call
      const argStr = compactArgs(input.args);
      this.pushAudit({
        ts: now,
        cid: this.cidFor(input.ip, input.ua),
        action: tool,
        terms: null,
        state: input.outcome === 'error' ? 'error' : 'ok',
        tokens: Math.max(1, Math.ceil(argStr.length / 4)),
        hash: this.auditHash(tool + '|' + argStr + '|' + input.outcome),
      });
    }

    this.prune();
    this.scheduleSave();
  }

  /**
   * Record a settled x402 payment (a domain-registration mint, or a gateway
   * pay). Public-safe: tx hashes are on-ledger and the payer is shortened.
   */
  recordX402(evt: {
    kind: 'register' | 'pay';
    item: string;
    amountXrp: number;
    payer: string;
    tx: string;
    mintTx?: string | null;
    payTo?: string | null;
  }): void {
    if (!this.enabled) return;
    const x = (this.store.x402 = this.store.x402 ?? { payments: 0, xrpDrops: 0, minted: 0, recent: [] });
    const dropsAdd = Math.max(0, Math.round((evt.amountXrp || 0) * 1_000_000));
    x.payments += 1;
    x.xrpDrops += dropsAdd;
    if (evt.kind === 'register' && evt.mintTx) x.minted += 1;
    if (evt.kind === 'register') x.regs = (x.regs ?? 0) + 1;
    else x.pays = (x.pays ?? 0) + 1;
    const ps = (x.payers = x.payers ?? []);
    const pshort = shortenAddresses(evt.payer || '');
    if (pshort && ps.indexOf(pshort) === -1) {
      ps.push(pshort);
      if (ps.length > 2000) ps.splice(0, ps.length - 2000);
    }
    const dayK = new Date().toISOString().slice(0, 10);
    x.days = x.days ?? {};
    x.days[dayK] = (x.days[dayK] ?? 0) + dropsAdd;
    x.recent.push({
      ts: Date.now(),
      kind: evt.kind,
      item: clean(evt.item || ''),
      amountXrp: evt.amountXrp || 0,
      payer: shortenAddresses(evt.payer || ''),
      tx: evt.tx || '',
      mintTx: evt.mintTx ?? null,
    });
    if (x.recent.length > X402_RECENT_MAX) x.recent.splice(0, x.recent.length - X402_RECENT_MAX);

    const payToShort = evt.payTo ? shortenAddresses(evt.payTo) : '';
    this.pushAudit({
      ts: Date.now(),
      cid: 'c_' + createHash('sha256').update(this.store.salt + '|' + (evt.payer || '')).digest('hex').slice(0, 8),
      action: 'x402 ' + evt.kind,
      terms: (evt.amountXrp || 0) + ' XRP' + (payToShort ? ' → ' + payToShort : ''),
      state: evt.tx ? 'tx:' + evt.tx : 'ok',
      tokens: null,
      hash: this.auditHash('x402|' + evt.kind + '|' + clean(evt.item || '') + '|' + (evt.tx || '')),
    });
    this.scheduleSave();
  }

  /** Record a refused/failed x402 request (payment failed, taken, mint failed). */
  recordX402Refusal(evt: {
    kind: 'register' | 'pay';
    item: string;
    reason: string;
    payer?: string | null;
    amountXrp?: number | null;
  }): void {
    if (!this.enabled) return;
    this.pushAudit({
      ts: Date.now(),
      cid: 'c_' + createHash('sha256').update(this.store.salt + '|' + (evt.payer || '')).digest('hex').slice(0, 8),
      action: 'x402 ' + evt.kind,
      terms: evt.amountXrp ? evt.amountXrp + ' XRP' : clean(evt.item || ''),
      state: 'refused:' + clean(evt.reason || 'error'),
      tokens: null,
      hash: this.auditHash('x402refuse|' + evt.kind + '|' + clean(evt.item || '') + '|' + clean(evt.reason || '')),
    });
    this.scheduleSave();
  }

  private prune(): void {
    const days = Object.keys(this.store.days);
    if (days.length > RETENTION_DAYS) {
      days.sort(); // ascending YYYY-MM-DD
      for (const d of days.slice(0, days.length - RETENTION_DAYS)) {
        delete this.store.days[d];
        this.uniqueSets.delete(d);
      }
    }
    // drop expired client-identity links (keep the map small + fresh)
    const cutoff = Date.now() - AGENT_TTL_MS;
    for (const k in this.store.links) {
      if ((this.store.links[k] as { ts: number }).ts < cutoff) delete this.store.links[k];
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
      .filter(([name]) => KNOWN_TOOLS.has(name)) // hide scanner-injected tool names
      .map(([name, v]) => ({ name, ok: v.ok, error: v.error, total: v.ok + v.error }))
      .sort((a, b) => b.total - a.total);

    const agentTotals = Object.entries(s.agents)
      .map(([name, v]) => ({
        name,
        connections: v.connections,
        toolCalls: v.toolCalls ?? 0,
        kind: classifyAgent(name),
      }))
      .sort((a, b) => b.toolCalls - a.toolCalls || b.connections - a.connections);

    const clients = agentTotals.filter((a) => a.kind === 'client');
    const probes = agentTotals.filter((a) => a.kind === 'probe');
    const sum = (arr: typeof agentTotals, k: 'connections' | 'toolCalls') =>
      arr.reduce((n, a) => n + a[k], 0);

    const uniqueLast30 = uniqueOverWindow(this.uniqueSets, 30);

    const out: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      since: s.since,
      totals: {
        connections: s.allTime.connections, // all, incl. probes
        realConnections: sum(clients, 'connections'), // real clients only
        probeConnections: sum(probes, 'connections'),
        toolCalls: s.allTime.toolCalls,
        clientToolCalls: sum(clients, 'toolCalls'),
        errors: s.allTime.errors,
        uniqueClientsLast30d: uniqueLast30,
        tools: toolTotals.length,
      },
      tools: toolTotals,
      agents: agentTotals, // each carries { kind, toolCalls }
      clients,
      probes,
      series, // daily; dashboard rolls up to weekly/monthly
      recent: s.recent.filter((r) => KNOWN_TOOLS.has(r.tool)).slice(-25).reverse(), // known tools only, newest first
    };

    // x402 on-chain activity — public-safe (tx hashes on-ledger, payer shortened).
    const x = s.x402 ?? { payments: 0, xrpDrops: 0, minted: 0, recent: [] };
    out.x402 = {
      payments: x.payments,
      xrpVolume: x.xrpDrops / 1_000_000,
      minted: x.minted,
      regs: x.regs ?? 0,
      pays: x.pays ?? 0,
      uniquePayers: (x.payers ?? []).length,
      series: Object.keys(x.days ?? {})
        .sort()
        .map((d) => ({ date: d, xrp: ((x.days as Record<string, number>)[d] ?? 0) / 1_000_000 })),
      recent: x.recent.slice(-15).reverse(),
    };

    // per-request audit trail (public-safe: cid opaque, terms shortened, hash digest).
    // Keep x402 actions + known tools; drop scanner-injected tool names.
    out.audit = (s.audit ?? [])
      .filter((a) => a.action && (a.action.indexOf('x402 ') === 0 || KNOWN_TOOLS.has(a.action)))
      .slice(-30)
      .reverse();

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
