#!/usr/bin/env node
/**
 * buy.mjs — register/buy an XRPName root domain via x402 (agent side).
 *
 * Signs the XRPL Payment (via x402Fetch) then the NFTokenAcceptOffer to take
 * custody. The wallet SEED lives only in this folder's .env — never on the server.
 *
 * Setup:  npm install ; cp .env.example .env ; edit .env (XRPL_BUYER_SEED)
 * Run:    node buy.mjs <domain>        e.g. node buy.mjs alice.xrp
 */
import dotenv from 'dotenv';
import { Client, Wallet } from 'xrpl';
import { x402Fetch, decodePaymentRequiredHeader, decodePaymentResponseHeader } from 'x402-xrpl';

dotenv.config({ override: false });

const seed = process.env.XRPL_BUYER_SEED;
const resourceUrl = process.env.RESOURCE_URL ?? 'https://xrpdomains.xyz/mcp/x402/register';
const domain = process.argv[2] ?? process.env.DOMAIN;
const network = process.env.XRPL_NETWORK ?? 'xrpl:0';
const rpc = process.env.XRPL_RPC ?? (network === 'xrpl:1' ? 'wss://s.altnet.rippletest.net:51233' : 'wss://xrplcluster.com');

if (!seed) throw new Error('XRPL_BUYER_SEED is required — set it in .env');
if (!domain) throw new Error('DOMAIN is required — a ROOT domain e.g. alice.xrp (not a subname)');

const buyer = Wallet.fromSeed(seed);
console.log(`Buyer  : ${buyer.classicAddress}`);
console.log(`Network: ${network}   Resource: ${resourceUrl}`);
console.log(`Domain : ${domain}\n`);

// x402Fetch handles the 402: signs the Payment + retries with PAYMENT-SIGNATURE.
// Agents with their OWN wallet: pass your existing signer here instead of a
// seed-derived one — and use the same signer for the AcceptOffer below.
const fetchPaid = x402Fetch({ wallet: buyer, network });

const resp = await fetchPaid(resourceUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ domain }),
});

console.log(`HTTP ${resp.status}`);
const bodyText = await resp.text();
let body;
try {
  body = JSON.parse(bodyText);
} catch {
  body = bodyText;
}
console.log(JSON.stringify(body, null, 2));

if (resp.status === 402) {
  const pr = resp.headers.get('PAYMENT-REQUIRED');
  if (pr) console.log('\nPAYMENT-REQUIRED:', JSON.stringify(decodePaymentRequiredHeader(pr), null, 2));
  process.exit(1);
}

const settled = resp.headers.get('PAYMENT-RESPONSE');
if (settled) console.log('\nPAYMENT-RESPONSE:', JSON.stringify(decodePaymentResponseHeader(settled), null, 2));

if (resp.status !== 200 || !body || body.minted !== true) {
  console.error('\nRegistration did not complete.');
  process.exit(1);
}

const tpl = body.accept_offer_template;
if (!tpl) {
  console.log('\nNo accept_offer_template returned — nothing to accept.');
  process.exit(0);
}

console.log('\nAccepting the sell offer to take custody...');
const client = new Client(rpc);
await client.connect();
try {
  const prepared = await client.autofill({ ...tpl, Account: buyer.classicAddress });
  const signed = buyer.sign(prepared);
  const res = await client.submitAndWait(signed.tx_blob);
  const code = res.result?.meta?.TransactionResult;
  console.log(`AcceptOffer: ${code}  tx=${res.result?.hash}`);
  if (code !== 'tesSUCCESS') process.exit(1);
  console.log(`\n✅ Done — ${domain} is now in ${buyer.classicAddress}`);
} finally {
  await client.disconnect();
}
