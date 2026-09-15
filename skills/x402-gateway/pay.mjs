#!/usr/bin/env node
/**
 * x402 Gateway — Pay client (one signature).
 *
 * Pays any x402-protected resource on XRPL: tips, donations, pay-per-request,
 * paywalls. x402Fetch handles the 402 → signs the Payment → retries. The wallet
 * seed lives only in this folder's .env — never on the server.
 *
 * Run:  node pay.mjs <resource-url>
 *   e.g. node pay.mjs https://example.com/tip
 * Env:  XRPL_SEED (required), XRPL_NETWORK (xrpl:0 mainnet | xrpl:1 testnet)
 */
import dotenv from 'dotenv';
import { Wallet } from 'xrpl';
import { x402Fetch, decodePaymentRequiredHeader, decodePaymentResponseHeader } from 'x402-xrpl';

dotenv.config({ override: false });

const seed = process.env.XRPL_SEED;
const url = process.argv[2] ?? process.env.RESOURCE_URL;
const method = (process.env.HTTP_METHOD ?? 'GET').toUpperCase();
const network = process.env.XRPL_NETWORK ?? 'xrpl:0';

if (!seed) throw new Error('XRPL_SEED is required — set it in .env');
if (!url) throw new Error('Pass a resource URL: node pay.mjs <url>');

const wallet = Wallet.fromSeed(seed);
console.log(`Payer  : ${wallet.classicAddress}`);
console.log(`Network: ${network}   ${method} ${url}\n`);

// Agents with their own wallet: pass your existing signer instead of a seed one.
const fetchPaid = x402Fetch({ wallet, network });

const init = { method, headers: { accept: 'application/json' } };
if (method !== 'GET' && method !== 'HEAD') {
  init.headers['content-type'] = 'application/json';
  init.body = process.env.BODY ?? '{}';
}

const resp = await fetchPaid(url, init);
console.log(`HTTP ${resp.status}`);

const required = resp.headers.get('PAYMENT-REQUIRED');
if (required) console.log('PAYMENT-REQUIRED:', JSON.stringify(decodePaymentRequiredHeader(required), null, 2));

const settled = resp.headers.get('PAYMENT-RESPONSE');
if (settled) console.log('PAYMENT-RESPONSE:', JSON.stringify(decodePaymentResponseHeader(settled), null, 2));

const body = await resp.text();
console.log('\nBody:', body.slice(0, 2000));

if (resp.status === 402) { console.error('\nPayment not completed (still 402) — check seed / balance.'); process.exit(1); }
if (!resp.ok) process.exit(1);
console.log(`\n✅ Paid & received the resource.`);
