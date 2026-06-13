import { describe, it, expect } from 'vitest';
import { mapOffer, buildPendingPayload } from '../../src/tools/get-pending-offers.js';

const SENDER_KEYS = ['sender', 'owner', 'Owner', 'account', 'Account', 'from'];
const DESTINATION_KEYS = ['destination', 'Destination', 'to'];

describe('mapOffer', () => {
  it('extracts canonical fields with snake_case keys', () => {
    const raw = {
      domain: 'alice.xrp',
      nftoken_id: '000800...ABC',
      offer_id: 'OFFER123',
      sender: 'rSenderAddr',
      expiration: 780000000,
      amount_drops: '12000000',
    };
    expect(mapOffer(raw, SENDER_KEYS)).toMatchObject({
      domain: 'alice.xrp',
      nftoken_id: '000800...ABC',
      offer_id: 'OFFER123',
      counterparty: 'rSenderAddr',
      expiration: 780000000,
      amount_drops: '12000000',
    });
  });

  it('falls back to XRPL-native key spellings', () => {
    const raw = {
      Name: 'bob.xrp',
      NFTokenID: 'NFTID',
      nft_offer_index: 'IDX9',
      Destination: 'rDestAddr',
      Expiration: 800,
      Amount: '5000000',
    };
    expect(mapOffer(raw, DESTINATION_KEYS)).toMatchObject({
      domain: 'bob.xrp',
      nftoken_id: 'NFTID',
      offer_id: 'IDX9',
      counterparty: 'rDestAddr',
      expiration: 800,
      amount_drops: '5000000',
    });
  });

  it('coerces numeric expiration strings and missing fields to null', () => {
    const m = mapOffer({ Expiration: '123' }, SENDER_KEYS);
    expect(m.expiration).toBe(123);
    expect(m.domain).toBeNull();
    expect(m.offer_id).toBeNull();
    expect(m.counterparty).toBeNull();
  });

  it('preserves the untouched raw object', () => {
    const raw = { domain: 'x.xrp', weird_field: 42 };
    expect(mapOffer(raw, SENDER_KEYS).raw).toEqual(raw);
  });

  it('handles non-object input safely', () => {
    expect(mapOffer(null, SENDER_KEYS).raw).toEqual({});
    expect(mapOffer('nope', SENDER_KEYS).domain).toBeNull();
  });
});

describe('buildPendingPayload', () => {
  it('splits incoming/outgoing and computes counts', () => {
    const payload = buildPendingPayload(
      'rMe',
      [{ domain: 'in1.xrp', sender: 'rA' }, { domain: 'in2.xrp', sender: 'rB' }],
      [{ domain: 'out1.xrp', destination: 'rC' }],
      'https://xrpdomains.xyz/mydomains',
    );
    expect(payload.address).toBe('rMe');
    expect(payload.counts).toEqual({ incoming: 2, outgoing: 1, total: 3 });
    expect(payload.incoming[0]?.counterparty).toBe('rA');
    expect(payload.outgoing[0]?.counterparty).toBe('rC');
    expect(payload.manage_url).toContain('/mydomains');
  });

  it('handles empty lists', () => {
    const payload = buildPendingPayload('rMe', [], [], 'https://x/mydomains');
    expect(payload.counts).toEqual({ incoming: 0, outgoing: 0, total: 0 });
  });
});
