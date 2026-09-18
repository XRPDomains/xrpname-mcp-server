#!/usr/bin/env node
/**
 * accept-offer.mjs — claim an NFT sell offer already created for the buyer
 * wallet (recovery: register paid + minted, but AcceptOffer never got signed).
 *
 * Find <offerId> in GET /api/xrplnft/getPendingDomains?owner=<payer> under
 * data.incoming[] (match domain + destination = payer).
 *
 * Run:  node accept-offer.mjs <NFTokenSellOffer-id>
 */
import dotenv from 'dotenv';
import { Client, Wallet } from 'xrpl';

dotenv.config({ override: false });

const seed = process.env.XRPL_BUYER_SEED;
const offerId = process.argv[2] ?? process.env.OFFER_ID;
const network = process.env.XRPL_NETWORK ?? 'xrpl:0';
const rpc = process.env.XRPL_RPC ?? (network === 'xrpl:1' ? 'wss://s.altnet.rippletest.net:51233' : 'wss://xrplcluster.com');
// RPC fallbacks — public nodes rate-limit (tooBusy); rotate on busy/network errors.
const rpcList = [rpc, ...(process.env.XRPL_RPC_FALLBACKS ? process.env.XRPL_RPC_FALLBACKS.split(',') : (network === 'xrpl:1' ? [] : ['wss://s1.ripple.com:51233', 'wss://s2.ripple.com:51233']))]
  .map((s) => s.trim())
  .filter((v, i, a) => v && a.indexOf(v) === i);

if (!seed) throw new Error('XRPL_BUYER_SEED is required (in .env)');
if (!offerId) throw new Error('Pass the NFTokenSellOffer id: node accept-offer.mjs <offerId>');

const buyer = Wallet.fromSeed(seed);
console.log(`Buyer   : ${buyer.classicAddress}`);
console.log(`Offer   : ${offerId}`);
console.log(`Network : ${network}\n`);

// AcceptOffer is idempotent (offer consumed once) → safe to retry on another RPC.
async function acceptWithFallback(rpcs) {
  let lastErr;
  for (let i = 0; i < rpcs.length; i++) {
    const client = new Client(rpcs[i]);
    try {
      await client.connect();
      const prepared = await client.autofill({
        TransactionType: 'NFTokenAcceptOffer',
        Account: buyer.classicAddress,
        NFTokenSellOffer: offerId,
      });
      const signed = buyer.sign(prepared);
      return await client.submitAndWait(signed.tx_blob);
    } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      const retriable = /toobusy|too busy|busy|slowdown|ratelimit|429|econn|timeout|disconnect|network/i.test(msg);
      console.warn('RPC ' + rpcs[i] + ' failed: ' + msg + (retriable && i < rpcs.length - 1 ? ' — trying next RPC…' : ''));
      if (!retriable) throw e;
    } finally {
      try { await client.disconnect(); } catch {}
    }
  }
  throw lastErr;
}

const res = await acceptWithFallback(rpcList);
const code = res.result?.meta?.TransactionResult;
console.log(`AcceptOffer: ${code}  tx=${res.result?.hash}`);
if (code !== 'tesSUCCESS') process.exit(1);
console.log(`\n✅ Accepted — the NFT is now in ${buyer.classicAddress}`);
