#!/usr/bin/env node
/**
 * x402 Gateway — Pay-to-NFT client (roadmap) (two signatures).
 *
 * Pays an x402 NFT endpoint for an item, then signs the NFTokenAcceptOffer to
 * take custody. Generic — works against any x402-gateway NFT endpoint that follows
 * the contract (XRPName domain registration is one such endpoint).
 *
 * Run:  node buy-nft.mjs <item>                 # pay → mint → accept
 *       node buy-nft.mjs --offer <NFTokenSellOffer-id>   # accept an existing priced offer
 * Env:  XRPL_SEED (required), NFT_ENDPOINT, XRPL_NETWORK, XRPL_RPC
 */
import dotenv from 'dotenv';
import { Client, Wallet } from 'xrpl';
import { x402Fetch, decodePaymentRequiredHeader, decodePaymentResponseHeader } from 'x402-xrpl';

dotenv.config({ override: false });

const seed = process.env.XRPL_SEED;
const endpoint = process.env.NFT_ENDPOINT ?? 'https://xrpdomains.xyz/mcp/x402/register';
const network = process.env.XRPL_NETWORK ?? 'xrpl:0';
const rpc = process.env.XRPL_RPC ?? (network === 'xrpl:1' ? 'wss://s.altnet.rippletest.net:51233' : 'wss://xrplcluster.com');
if (!seed) throw new Error('XRPL_SEED is required — set it in .env');
const wallet = Wallet.fromSeed(seed);

async function acceptOffer(offerId) {
  console.log(`Accepting offer ${offerId} …`);
  const client = new Client(rpc);
  await client.connect();
  try {
    const prepared = await client.autofill({ TransactionType: 'NFTokenAcceptOffer', Account: wallet.classicAddress, NFTokenSellOffer: offerId });
    const signed = wallet.sign(prepared);
    const res = await client.submitAndWait(signed.tx_blob);
    const code = res.result?.meta?.TransactionResult;
    console.log(`AcceptOffer: ${code}  tx=${res.result?.hash}`);
    if (code !== 'tesSUCCESS') process.exit(1);
    console.log(`\n✅ NFT is now in ${wallet.classicAddress}`);
  } finally { await client.disconnect(); }
}

// --offer <id>: accept an existing priced sell offer (no x402).
if (process.argv[2] === '--offer') {
  const id = process.argv[3];
  if (!id) throw new Error('Pass the offer id: node buy-nft.mjs --offer <offerId>');
  await acceptOffer(id);
  process.exit(0);
}

// Mint-on-demand path.
const item = process.argv[2] ?? process.env.ITEM;
if (!item) throw new Error('Pass an item: node buy-nft.mjs <item>');
console.log(`Payer  : ${wallet.classicAddress}`);
console.log(`Network: ${network}   Endpoint: ${endpoint}`);
console.log(`Item   : ${item}\n`);

const fetchPaid = x402Fetch({ wallet, network });
const resp = await fetchPaid(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ item, domain: item }), // `domain` kept for the XRPName adapter
});
console.log(`HTTP ${resp.status}`);
const text = await resp.text();
let body; try { body = JSON.parse(text); } catch { body = text; }
console.log(JSON.stringify(body, null, 2));

if (resp.status === 402) {
  const pr = resp.headers.get('PAYMENT-REQUIRED');
  if (pr) console.log('\nPAYMENT-REQUIRED:', JSON.stringify(decodePaymentRequiredHeader(pr), null, 2));
  process.exit(1);
}
const settled = resp.headers.get('PAYMENT-RESPONSE');
if (settled) console.log('\nPAYMENT-RESPONSE:', JSON.stringify(decodePaymentResponseHeader(settled), null, 2));

if (resp.status !== 200 || !body || body.minted !== true) { console.error('\nPurchase did not complete.'); process.exit(1); }
const tpl = body.accept_offer_template;
if (tpl?.NFTokenSellOffer) { await acceptOffer(tpl.NFTokenSellOffer); }
else if (body.offer_id) { await acceptOffer(body.offer_id); }
else console.log('\nNo offer to accept in the response.');
