#!/usr/bin/env node
/**
 * Smoke test — §14.5. Spawns the stdio server, runs the MCP handshake,
 * lists tools, and calls each Phase-1 tool once with safe args
 * (no registration, no broadcast).
 *
 * Usage: node scripts/smoke-test.mjs            (uses dist/stdio.js — run `npm run build` first)
 *        node scripts/smoke-test.mjs --tsx      (uses tsx + src/stdio.ts, no build needed)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const useTsx = process.argv.includes('--tsx');
const transport = new StdioClientTransport(
  useTsx
    ? { command: 'npx', args: ['tsx', 'src/stdio.ts'] }
    : { command: 'node', args: ['dist/stdio.js'] },
);

const client = new Client({ name: 'smoke-test', version: '0.0.1' });

let failures = 0;
function check(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

try {
  await client.connect(transport);
  check('initialize handshake', true);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log('  tools:', names.join(', '));
  for (const expected of ['check_domains', 'get_domain_profile', 'check_tx_status']) {
    check(`tools/list contains ${expected}`, names.includes(expected));
  }

  /** Call a tool; returns parsed JSON or null after logging a FAIL. */
  async function callJson(name, args) {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? '';
    if (r.isError) {
      check(`${name} call`, false, text.slice(0, 120));
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      check(`${name} returns JSON`, false, text.slice(0, 120));
      return null;
    }
  }

  // check_domains — mixed valid/invalid, hits the real backend
  const cdJson = await callJson('check_domains', {
    domains: ['xrpdomains.xrp', 'this-name-should-be-free-12345', 'bad name!.xrp'],
  });
  if (cdJson) {
    check('check_domains returns results[]', Array.isArray(cdJson.results) && cdJson.results.length === 2);
    check('check_domains flags invalid input', cdJson.invalid_domains.length === 1);
    const free = cdJson.results.find((r) => r.domain.startsWith('this-name'));
    check('available domain has price_xrp', free && typeof free.price_xrp === 'number', `price=${free?.price_xrp}`);
  }

  // get_domain_profile
  const gpJson = await callJson('get_domain_profile', { domain: 'xrpdomains.xrp' });
  if (gpJson) {
    check('get_domain_profile returns profile_url', typeof gpJson.profile_url === 'string');
  }

  // check_tx_status — unknown-but-well-formed hash → not_found or pending
  const tsJson = await callJson('check_tx_status', { tx_hash: 'A'.repeat(64) });
  if (tsJson) {
    check(
      'check_tx_status answers for unknown hash',
      ['not_found', 'pending'].includes(tsJson.status),
      `status=${tsJson.status}`,
    );
  }

  // schema rejection
  const bad = await client.callTool({ name: 'check_tx_status', arguments: { tx_hash: 'xyz' } }).catch((e) => e);
  check('check_tx_status rejects bad hash', bad instanceof Error || bad.isError === true);
} catch (err) {
  check('smoke run', false, String(err?.message ?? err));
} finally {
  await client.close().catch(() => {});
}

console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
