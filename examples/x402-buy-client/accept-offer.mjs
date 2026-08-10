#!/usr/bin/env node
/**
 * Standalone AcceptOffer helper — claim an NFT sell offer that was already
 * created for the buyer wallet (e.g. when the register call minted + offered
 * but the client never signed the AcceptOffer, so the domain is still pending).
 *
 * Uses the same .env as the buy client (XRPL_BUYER_SEED, XRPL_RPC/NETWORK).
 *
 * Run:  node accept-offer.mjs <NFTokenSellOffer-id>
 *   e.g. node accept-offer.mjs 236D3652EAF0239A8FAC81076C0E3BE6B373DEFEC12EE5CE66DC4A7B7068F26D
 */
import dotenv from 'dotenv';
import { Client, Wallet } from 'xrpl';

dotenv.config({ override: false });

const seed = process.env.XRPL_BUYER_SEED;
const offerId = process.argv[2] ?? process.env.OFFER_ID;
const network = process.env.XRPL_NETWORK ?? 'xrpl:0';
const rpc = process.env.XRPL_RPC ?? (network === 'xrpl:1' ? 'wss://s.altnet.rippletest.net:51233' : 'wss://xrplcluster.com');

if (!seed) throw new Error('XRPL_BUYER_SEED is required (in .env)');
if (!offerId) throw new Error('Pass the NFTokenSellOffer id: node accept-offer.mjs <offerId>');

const buyer = Wallet.fromSeed(seed);
console.log(`Buyer   : ${buyer.classicAddress}`);
console.log(`Offer   : ${offerId}`);
console.log(`Network : ${network}\n`);

const client = new Client(rpc);
await client.connect();
try {
  const prepared = await client.autofill({
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyer.classicAddress,
    NFTokenSellOffer: offerId,
  });
  const signed = buyer.sign(prepared);
  const res = await client.submitAndWait(signed.tx_blob);
  const code = res.result?.meta?.TransactionResult;
  console.log(`AcceptOffer: ${code}  tx=${res.result?.hash}`);
  if (code !== 'tesSUCCESS') process.exit(1);
  console.log(`\n✅ Accepted — the NFT is now in ${buyer.classicAddress}`);
} finally {
  await client.disconnect();
}
