#!/usr/bin/env node
/**
 * backfill-x402.mjs — seed the dashboard's x402 activity + audit trail from
 * on-chain history, so the panels show real data right after deploy.
 *
 * Scans the contract wallet's XRPL transactions for x402 register payments
 * (Payment · SourceTag = X402_SOURCE_TAG · Destination = contract), and merges
 * them into the analytics store (data/analytics.json). Idempotent: dedupes by
 * tx hash, so re-running never double-counts. It ONLY adds on-chain register
 * payments; live-recorded gateway pays are preserved.
 *
 * Run (in the repo, deps installed):
 *   node scripts/backfill-x402.mjs
 * Env (optional):
 *   MCP_ANALYTICS_FILE        default ./data/analytics.json
 *   XRPDOMAINS_CONTRACT_ADDRESS  default raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9
 *   X402_SOURCE_TAG           default 804681468
 *   XRPL_WSS_URL              default wss://xrplcluster.com
 *   BACKFILL_MAX_PAGES        default 25  (200 tx/page)
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Client } from 'xrpl';

const FILE = process.env.MCP_ANALYTICS_FILE || './data/analytics.json';
const CONTRACT = process.env.XRPDOMAINS_CONTRACT_ADDRESS || 'raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9';
const SOURCE_TAG = Number(process.env.X402_SOURCE_TAG || 804681468);
const WSS = process.env.XRPL_WSS_URL || 'wss://xrplcluster.com';
const MAX_PAGES = Number(process.env.BACKFILL_MAX_PAGES || 25);
const X402_RECENT_MAX = 25;
const AUDIT_MAX = 40;
const RIPPLE_EPOCH = 946684800; // seconds between 1970 and 2000

function shortAddr(s) {
  return String(s || '').replace(/r[1-9A-HJ-NP-Za-km-z]{24,34}/g, (m) => m.slice(0, 6) + '…' + m.slice(-4));
}
function decodeMemoDomain(tx) {
  try {
    const m = (tx.Memos || [])[0]?.Memo?.MemoData;
    if (!m) return '';
    const s = Buffer.from(m, 'hex').toString('utf8');
    // invoiceId = "XRPNAME-<domain>-<uuid>"; uuid is the trailing 36 chars.
    if (s.startsWith('XRPNAME-') && s.length > 8 + 37) return s.slice(8, -37);
    return '';
  } catch {
    return '';
  }
}

function loadStore() {
  if (existsSync(FILE)) {
    try {
      const s = JSON.parse(readFileSync(FILE, 'utf8'));
      if (s && s.version === 1) return s;
    } catch {
      /* fall through to fresh */
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1,
    salt: randomBytes(16).toString('hex'),
    since: today,
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

async function main() {
    const store = loadStore();
    store.x402 = store.x402 || { payments: 0, xrpDrops: 0, minted: 0, recent: [] };
    store.audit = store.audit || [];
    const auditHash = (parts) => createHash('sha256').update(store.salt + '|' + parts).digest('hex').slice(0, 12);

    const seenTx = new Set(store.x402.recent.map((r) => r.tx));
    const seenAuditTx = new Set(
      store.audit.filter((a) => String(a.state || '').startsWith('tx:')).map((a) => a.state.slice(3)),
    );

    const client = new Client(WSS);
    await client.connect();
    const found = [];
    let marker;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await client.request({
          command: 'account_tx',
          account: CONTRACT,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit: 200,
          forward: false,
          marker,
        });
        const txs = res.result?.transactions || [];
        for (const t of txs) {
          const tx = t.tx || t.tx_json || {};
          const meta = t.meta || {};
          if (tx.TransactionType !== 'Payment') continue;
          if (Number(tx.SourceTag) !== SOURCE_TAG) continue;
          if (tx.Destination !== CONTRACT) continue;
          if (meta.TransactionResult !== 'tesSUCCESS') continue;
          const hash = tx.hash || t.hash;
          if (!hash) continue;
          const da = meta.delivered_amount ?? tx.Amount;
          const drops = typeof da === 'string' ? Number(da) : 0; // XRP only (IOU skipped)
          if (!drops) continue;
          const whenMs =
            tx.date != null
              ? (Number(tx.date) + RIPPLE_EPOCH) * 1000
              : t.close_time_iso
                ? Date.parse(t.close_time_iso)
                : Date.now();
          found.push({
            hash,
            ts: whenMs,
            amountXrp: drops / 1_000_000,
            payer: tx.Account,
            domain: decodeMemoDomain(tx),
          });
        }
        marker = res.result?.marker;
        if (!marker) break;
      }
    } finally {
      await client.disconnect();
    }

    // oldest → newest so recent[] ends newest-last (matches live recording)
    found.sort((a, b) => a.ts - b.ts);
    let added = 0;
    for (const p of found) {
      if (seenTx.has(p.hash)) continue;
      seenTx.add(p.hash);
      added++;
      const dropsAdd = Math.max(0, Math.round(p.amountXrp * 1_000_000));
      store.x402.payments += 1;
      store.x402.xrpDrops += dropsAdd;
      store.x402.minted += 1; // register payments → a mint (approximate)
      store.x402.regs = (store.x402.regs ?? 0) + 1;
      const pers = (store.x402.payers = store.x402.payers ?? []);
      const psh = shortAddr(p.payer);
      if (psh && pers.indexOf(psh) === -1) pers.push(psh);
      const dK = new Date(p.ts).toISOString().slice(0, 10);
      store.x402.days = store.x402.days ?? {};
      store.x402.days[dK] = (store.x402.days[dK] ?? 0) + dropsAdd;
      store.x402.recent.push({
        ts: p.ts,
        kind: 'register',
        item: p.domain || '',
        amountXrp: p.amountXrp,
        payer: shortAddr(p.payer),
        tx: p.hash,
        mintTx: null,
      });
      if (!seenAuditTx.has(p.hash)) {
        seenAuditTx.add(p.hash);
        store.audit.push({
          ts: p.ts,
          cid: 'c_' + createHash('sha256').update(store.salt + '|' + (p.payer || '')).digest('hex').slice(0, 8),
          action: 'x402 register',
          terms: p.amountXrp + ' XRP → ' + shortAddr(CONTRACT),
          state: 'tx:' + p.hash,
          tokens: null,
          hash: auditHash('x402|register|' + (p.domain || '') + '|' + p.hash),
        });
      }
    }

    // keep the ring buffers bounded + sorted newest-last
    store.x402.recent.sort((a, b) => a.ts - b.ts);
    if (store.x402.recent.length > X402_RECENT_MAX) {
      store.x402.recent = store.x402.recent.slice(-X402_RECENT_MAX);
    }
    store.audit.sort((a, b) => a.ts - b.ts);
    if (store.audit.length > AUDIT_MAX) store.audit = store.audit.slice(-AUDIT_MAX);

    mkdirSync(dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(store));
    renameSync(tmp, FILE);

    console.log('scanned pages, matched x402 register payments:', found.length);
    console.log('newly added (deduped):', added);
    console.log('x402 totals now → payments:', store.x402.payments, '· XRP:', (store.x402.xrpDrops / 1e6).toFixed(6), '· minted:', store.x402.minted);
    console.log('wrote', FILE);
}

main().catch((e) => {
  console.error('backfill failed:', e?.message || e);
  process.exit(1);
});
