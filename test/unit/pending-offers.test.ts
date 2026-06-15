import { describe, it, expect } from 'vitest';
import { mapOffer, mapMint, buildPendingPayload } from '../../src/tools/get-pending-offers.js';

const SENDER_KEYS = ['sender', 'owner', 'Owner', 'account', 'Account', 'from'];
const DESTINATION_KEYS = ['destination', 'Destination', 'to'];

// Shapes mirror the live getPendingDomains (E25) response.
const incomingRaw = {
  issuer: 'rIssuer',
  domain: 'claude-code-cli.xrpfi',
  owner: 'r3H41K9PG8gz44ZCJcDKC1MMLuaVM3n9jE', // the sender
  nftoken_id: 'NFTIN',
  offer_id: 'OFFER_IN',
  amount: '0',
  destination: 'rLhi87aSCyNW88tW4632yLiwinbghFZNue',
  expiration: null,
};
const outgoingRaw = {
  issuer: 'rIssuer',
  domain: 'bithomp-username.xrp',
  owner: 'rLhi87aSCyNW88tW4632yLiwinbghFZNue',
  nftoken_id: 'NFTOUT',
  offer_id: 'OFFER_OUT',
  amount: '0',
  destination: 'r3H41K9PG8gz44ZCJcDKC1MMLuaVM3n9jE', // the recipient
  expiration: 781000000,
};

describe('mapOffer', () => {
  it('incoming: sender comes from the NFT owner field', () => {
    expect(mapOffer(incomingRaw, SENDER_KEYS)).toMatchObject({
      domain: 'claude-code-cli.xrpfi',
      nftoken_id: 'NFTIN',
      offer_id: 'OFFER_IN',
      counterparty: 'r3H41K9PG8gz44ZCJcDKC1MMLuaVM3n9jE',
      amount_drops: '0',
      expiration: null,
      created_at: null,
    });
  });

  it('outgoing: counterparty comes from destination', () => {
    expect(mapOffer(outgoingRaw, DESTINATION_KEYS)).toMatchObject({
      domain: 'bithomp-username.xrp',
      offer_id: 'OFFER_OUT',
      counterparty: 'r3H41K9PG8gz44ZCJcDKC1MMLuaVM3n9jE',
      amount_drops: '0',
      expiration: 781000000,
    });
  });

  it('preserves raw and handles non-objects', () => {
    expect(mapOffer({ domain: 'x.xrp', weird: 1 }, SENDER_KEYS).raw).toEqual({ domain: 'x.xrp', weird: 1 });
    expect(mapOffer(null, SENDER_KEYS).domain).toBeNull();
  });
});

describe('mapMint', () => {
  it('maps a paid-but-unminted order', () => {
    const m = mapMint({
      domain: 'pending.xrp',
      nftoken_id: null,
      payment_tx: 'TXHASH123',
      status: 'paid',
      created_at: '2026-06-15T00:00:00',
    });
    expect(m).toMatchObject({
      domain: 'pending.xrp',
      nftoken_id: null,
      payment_tx: 'TXHASH123',
      status: 'paid',
      created_at: '2026-06-15T00:00:00',
    });
  });
});

describe('buildPendingPayload', () => {
  it('splits mint/incoming/outgoing and computes counts', () => {
    const p = buildPendingPayload(
      'rLhi87aSCyNW88tW4632yLiwinbghFZNue',
      [{ domain: 'mint1.xrp', payment_tx: 'TX1', status: 'paid' }],
      [incomingRaw],
      [outgoingRaw],
      'https://xrpdomains.xyz/mydomains',
    );
    expect(p.counts).toEqual({ mint: 1, incoming: 1, outgoing: 1, total: 3 });
    expect(p.incoming[0]?.counterparty).toBe('r3H41K9PG8gz44ZCJcDKC1MMLuaVM3n9jE');
    expect(p.outgoing[0]?.counterparty).toBe('r3H41K9PG8gz44ZCJcDKC1MMLuaVM3n9jE');
    expect(p.mint[0]?.payment_tx).toBe('TX1');
    expect(p.manage_url).toContain('/mydomains');
  });

  it('handles all-empty snapshot', () => {
    const p = buildPendingPayload('rMe', [], [], [], 'https://x/mydomains');
    expect(p.counts).toEqual({ mint: 0, incoming: 0, outgoing: 0, total: 0 });
  });
});
