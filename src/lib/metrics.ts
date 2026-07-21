/**
 * Metrics — §13.3. Minimal, zero-dependency Prometheus exposition.
 *
 * Deliberately NOT using `prom-client`: the metric set here is small and fixed,
 * and a self-contained registry keeps the dependency tree (and the audit
 * surface) tiny while remaining 100% testable offline. If the metric set grows
 * a lot later, swapping in `prom-client` is a localized change behind this file.
 *
 * Exposed series:
 *   mcp_requests_total{tool,outcome}        counter
 *   mcp_request_duration_seconds            histogram (global)
 *   mcp_cache_events_total{result}          counter  (hit|miss)
 *   mcp_xrpl_submit_total{result}           counter  (success|failure)
 *   process_uptime_seconds                  gauge
 */

const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5]; // seconds

interface Histogram {
  bucketCounts: number[]; // aligned with DURATION_BUCKETS, non-cumulative
  inf: number;
  sum: number;
  count: number;
}

export class Metrics {
  private readonly startMs = Date.now();
  private readonly counters = new Map<string, number>();
  private readonly duration: Histogram = {
    bucketCounts: new Array(DURATION_BUCKETS.length).fill(0),
    inf: 0,
    sum: 0,
    count: 0,
  };

  /** Record a completed tool/HTTP request. */
  recordRequest(tool: string, outcome: 'ok' | 'error', durationSec: number): void {
    this.bump(`mcp_requests_total|tool=${sanitize(tool)}|outcome=${outcome}`);
    this.observeDuration(durationSec);
  }

  /** Record a cache lookup result (drives cache hit rate). */
  recordCache(result: 'hit' | 'miss'): void {
    this.bump(`mcp_cache_events_total|result=${result}`);
  }

  /** Record an XRPL submit outcome. */
  recordXrplSubmit(result: 'success' | 'failure'): void {
    this.bump(`mcp_xrpl_submit_total|result=${result}`);
  }

  private observeDuration(sec: number): void {
    const v = Number.isFinite(sec) && sec >= 0 ? sec : 0;
    this.duration.sum += v;
    this.duration.count += 1;
    let placed = false;
    for (let i = 0; i < DURATION_BUCKETS.length; i++) {
      if (v <= (DURATION_BUCKETS[i] as number)) {
        this.duration.bucketCounts[i] = (this.duration.bucketCounts[i] as number) + 1;
        placed = true;
        break;
      }
    }
    if (!placed) this.duration.inf += 1;
  }

  private bump(key: string, by = 1): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  /** Render the full registry in Prometheus text exposition format. */
  render(): string {
    const lines: string[] = [];

    // --- counters, grouped by metric name so HELP/TYPE appear once each ---
    const byName = new Map<string, Array<{ labels: string; value: number }>>();
    for (const [key, value] of this.counters) {
      const [name, ...labelParts] = key.split('|');
      const labels = labelParts
        .map((p) => {
          const eq = p.indexOf('=');
          return `${p.slice(0, eq)}="${p.slice(eq + 1)}"`;
        })
        .join(',');
      const arr = byName.get(name as string) ?? [];
      arr.push({ labels, value });
      byName.set(name as string, arr);
    }

    for (const [name, series] of byName) {
      lines.push(`# HELP ${name} ${COUNTER_HELP[name] ?? name}`);
      lines.push(`# TYPE ${name} counter`);
      for (const s of series) {
        lines.push(s.labels ? `${name}{${s.labels}} ${s.value}` : `${name} ${s.value}`);
      }
    }

    // --- duration histogram (cumulative buckets per Prometheus spec) ---
    lines.push('# HELP mcp_request_duration_seconds MCP request latency in seconds.');
    lines.push('# TYPE mcp_request_duration_seconds histogram');
    let cumulative = 0;
    for (let i = 0; i < DURATION_BUCKETS.length; i++) {
      cumulative += this.duration.bucketCounts[i] as number;
      lines.push(`mcp_request_duration_seconds_bucket{le="${DURATION_BUCKETS[i]}"} ${cumulative}`);
    }
    cumulative += this.duration.inf;
    lines.push(`mcp_request_duration_seconds_bucket{le="+Inf"} ${cumulative}`);
    lines.push(`mcp_request_duration_seconds_sum ${round(this.duration.sum)}`);
    lines.push(`mcp_request_duration_seconds_count ${this.duration.count}`);

    // --- process uptime gauge ---
    lines.push('# HELP process_uptime_seconds Process uptime in seconds.');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.round((Date.now() - this.startMs) / 1000)}`);

    return lines.join('\n') + '\n';
  }
}

const COUNTER_HELP: Record<string, string> = {
  mcp_requests_total: 'Total MCP tool requests by tool and outcome.',
  mcp_cache_events_total: 'Cache lookups by result (hit|miss).',
  mcp_xrpl_submit_total: 'XRPL transaction submissions by result.',
};

/** Prometheus label values must not contain unescaped quotes/newlines. */
function sanitize(v: string): string {
  return v.replace(/[\n"\\]/g, '_');
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Process-wide singleton — imported by the HTTP server, cache, and tools. */
export const metrics = new Metrics();
