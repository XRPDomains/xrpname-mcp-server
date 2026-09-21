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
import { x402Fetch, decodePaymentRequiredHeader, decodePaymentResponseHeader, normalizeCurrencyCode } from 'x402-xrpl';

dotenv.config({ override: false });

const seed = process.env.XRPL_BUYER_SEED;
const resourceUrl = process.env.RESOURCE_URL ?? 'https://xrpdomains.xyz/mcp/x402/register';
const domain = process.argv[2] ?? process.env.DOMAIN;
// Pay in XRP (default) or RLUSD. RLUSD needs a trustline + balance (see preflight).
const payCurrency = (process.env.PAY_CURRENCY ?? 'XRP').toUpperCase();
const network = process.env.XRPL_NETWORK ?? 'xrpl:0';
const rpc = process.env.XRPL_RPC ?? (network === 'xrpl:1' ? 'wss://s.altnet.rippletest.net:51233' : 'wss://xrplcluster.com');
// RPC fallbacks — public nodes rate-limit (tooBusy); rotate on busy/network errors.
const rpcList = [rpc, ...(process.env.XRPL_RPC_FALLBACKS ? process.env.XRPL_RPC_FALLBACKS.split(',') : (network === 'xrpl:1' ? [] : ['wss://s1.ripple.com:51233', 'wss://s2.ripple.com:51233']))]
  .map((s) => s.trim())
  .filter((v, i, a) => v && a.indexOf(v) === i);

// AcceptOffer is idempotent (a sell offer is consumed once), so re-trying on a
// different RPC is safe. Autofill + sign + submit per node; rotate on busy errors.
async function acceptWithFallback(template, wallet, rpcs) {
  let lastErr;
  for (let i = 0; i < rpcs.length; i++) {
    const client = new Client(rpcs[i]);
    try {
      await client.connect();
      const prepared = await client.autofill({ ...template, Account: wallet.classicAddress });
      const signed = wallet.sign(prepared);
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

// RLUSD preflight: the payer sends RLUSD (an IOU), so the wallet must already
// hold a trustline to the issuer AND enough RLUSD balance. We never buy RLUSD
// for the user (that's their funds/decision). We only (optionally) open the
// zero-balance trustline when RLUSD_AUTO_TRUSTLINE=1, then stop for funding.
async function preflightRlusd(accepts) {
  const rl = (accepts || []).find((a) => a && a.asset && String(a.asset).toUpperCase() !== 'XRP');
  if (!rl) throw new Error('Server did not offer RLUSD — is X402_RLUSD_ENABLED on for this resource?');
  const issuer = rl.extra && rl.extra.issuer;
  const currency = rl.asset;
  const needed = Number(rl.amount);
  if (!issuer) throw new Error('RLUSD payment option is missing extra.issuer');
  const want = normalizeCurrencyCode(currency);
  const autoTrust = /^(1|true|yes|on)$/i.test(process.env.RLUSD_AUTO_TRUSTLINE ?? '');
  let lastErr;
  for (let i = 0; i < rpcList.length; i++) {
    const client = new Client(rpcList[i]);
    try {
      await client.connect();
      const lines = await client.request({ command: 'account_lines', account: buyer.classicAddress, peer: issuer });
      const line = (lines.result.lines || []).find((l) => normalizeCurrencyCode(l.currency) === want);
      if (!line) {
        if (!autoTrust) {
          throw new Error(
            'TRUSTLINE_MISSING: ' + buyer.classicAddress + ' has no RLUSD trustline to ' + issuer +
            '. Set RLUSD_AUTO_TRUSTLINE=1 to open one (costs ~0.2 XRP reserve), then fund the wallet with RLUSD and re-run.',
          );
        }
        console.log('No RLUSD trustline — opening one (TrustSet)…');
        const ts = await client.autofill({
          TransactionType: 'TrustSet',
          Account: buyer.classicAddress,
          LimitAmount: { currency, issuer, value: '1000000000' },
        });
        const signed = buyer.sign(ts);
        const r = await client.submitAndWait(signed.tx_blob);
        const code = r.result?.meta?.TransactionResult;
        console.log('TrustSet: ' + code + '  tx=' + r.result?.hash);
        if (code !== 'tesSUCCESS') throw new Error('TrustSet failed: ' + code);
        console.error('\nTrustline opened, but the wallet holds 0 RLUSD. Fund it with at least ' + needed + ' RLUSD, then re-run.');
        process.exit(1);
      }
      const balance = Number(line.balance);
      console.log('RLUSD trustline OK — balance ' + balance + ', need ' + needed);
      if (!(balance >= needed)) {
        throw new Error('INSUFFICIENT_RLUSD: balance ' + balance + ' < required ' + needed + '. Acquire RLUSD, then re-run.');
      }
      return;
    } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      const retriable = /toobusy|too busy|busy|slowdown|ratelimit|429|econn|timeout|disconnect|network/i.test(msg);
      if (!retriable) throw e;
      console.warn('RPC ' + rpcList[i] + ' failed: ' + msg + (i < rpcList.length - 1 ? ' — trying next RPC…' : ''));
    } finally {
      try { await client.disconnect(); } catch {}
    }
  }
  throw lastErr;
}

// Pick the RLUSD payment option from the 402 `accepts[]` (else fall back to XRP).
function selectRlusd(accepts) {
  return (
    accepts.find((a) => a.asset && String(a.asset).toUpperCase() !== 'XRP') ||
    accepts.find((a) => a.asset === 'XRP') ||
    accepts[0]
  );
}

if (!seed) throw new Error('XRPL_BUYER_SEED is required — set it in .env');
if (!domain) throw new Error('DOMAIN is required — a ROOT domain e.g. alice.xrp (not a subname)');

const buyer = Wallet.fromSeed(seed);
console.log(`Buyer  : ${buyer.classicAddress}`);
console.log(`Network: ${network}   Resource: ${resourceUrl}`);
console.log(`Domain : ${domain}   Pay in: ${payCurrency}\n`);

// RLUSD: verify the wallet can actually send RLUSD (trustline + balance) before
// we let x402Fetch sign an IOU Payment that would otherwise fail on-ledger.
if (payCurrency === 'RLUSD') {
  const probe = await fetch(resourceUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ domain }),
  });
  const probeBody = await probe.json().catch(() => ({}));
  await preflightRlusd(probeBody.accepts || []);
}

// x402Fetch handles the 402: signs the Payment + retries with PAYMENT-SIGNATURE.
// Agents with their OWN wallet: pass your existing signer here instead of a
// seed-derived one — and use the same signer for the AcceptOffer below.
// paymentRequirementsSelector chooses which `accepts[]` option to pay (RLUSD vs XRP).
const fetchPaid = x402Fetch({
  wallet: buyer,
  network,
  ...(payCurrency === 'RLUSD' ? { paymentRequirementsSelector: selectRlusd } : {}),
});

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
const res = await acceptWithFallback(tpl, buyer, rpcList);
const code = res.result?.meta?.TransactionResult;
console.log(`AcceptOffer: ${code}  tx=${res.result?.hash}`);
if (code !== 'tesSUCCESS') process.exit(1);
const paidWith = body.paid_currency === 'RLUSD' ? `${body.paid_rlusd ?? ''} RLUSD` : payCurrency;
console.log(`\n✅ Done — ${domain} is now in ${buyer.classicAddress} (paid in ${paidWith})`);
