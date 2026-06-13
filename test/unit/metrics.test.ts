import { describe, it, expect } from 'vitest';
import { Metrics } from '../../src/lib/metrics.js';

describe('Metrics.render', () => {
  it('emits counter series with HELP/TYPE once per metric', () => {
    const m = new Metrics();
    m.recordRequest('check_domains', 'ok', 0.12);
    m.recordRequest('check_domains', 'ok', 0.20);
    m.recordRequest('get_pending_offers', 'error', 0.30);
    const out = m.render();

    expect(out).toContain('# TYPE mcp_requests_total counter');
    expect(out).toContain('mcp_requests_total{tool="check_domains",outcome="ok"} 2');
    expect(out).toContain('mcp_requests_total{tool="get_pending_offers",outcome="error"} 1');
    // HELP appears exactly once for the metric
    expect(out.match(/# HELP mcp_requests_total/g)?.length).toBe(1);
  });

  it('emits a valid cumulative histogram', () => {
    const m = new Metrics();
    m.recordRequest('t', 'ok', 0.04); // <= 0.05
    m.recordRequest('t', 'ok', 0.40); // <= 0.5
    m.recordRequest('t', 'ok', 9.0); // +Inf
    const out = m.render();

    expect(out).toContain('# TYPE mcp_request_duration_seconds histogram');
    // buckets are cumulative: le=0.05 →1, le=0.5 →2, +Inf →3
    expect(out).toContain('mcp_request_duration_seconds_bucket{le="0.05"} 1');
    expect(out).toContain('mcp_request_duration_seconds_bucket{le="0.5"} 2');
    expect(out).toContain('mcp_request_duration_seconds_bucket{le="+Inf"} 3');
    expect(out).toContain('mcp_request_duration_seconds_count 3');
    expect(out).toContain('mcp_request_duration_seconds_sum 9.44');
  });

  it('tracks cache hit/miss', () => {
    const m = new Metrics();
    m.recordCache('hit');
    m.recordCache('hit');
    m.recordCache('miss');
    const out = m.render();
    expect(out).toContain('mcp_cache_events_total{result="hit"} 2');
    expect(out).toContain('mcp_cache_events_total{result="miss"} 1');
  });

  it('sanitizes label values', () => {
    const m = new Metrics();
    m.recordRequest('we"ird\ntool', 'ok', 0.1);
    const out = m.render();
    expect(out).not.toContain('we"ird');
    expect(out).toContain('we_ird_tool');
  });

  it('always emits the uptime gauge', () => {
    const out = new Metrics().render();
    expect(out).toContain('# TYPE process_uptime_seconds gauge');
    expect(out).toMatch(/process_uptime_seconds \d+/);
  });
});
