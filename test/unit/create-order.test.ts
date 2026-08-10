import { describe, it, expect } from 'vitest';
import {
  buildCreateOrderPayload,
  parseCreateOrderResponse,
  buildAcceptOfferTemplate,
  type CreateOrderInput,
} from '../../src/lib/create-order.js';

const base: CreateOrderInput = {
  domain: 'alice.xrp',
  paymentTx: 'A1B2C3',
  buyer: 'rBuyer',
  contractAddress: 'rContract',
  baseUri: 'https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/',
  network: 'MAINNET',
  amount: 30,
  price: 60,
  currency: 'XRP',
  uuid: 'u-1',
};

describe('buildCreateOrderPayload', () => {
  it('builds the XRP body matching the handoff contract', () => {
    const b = buildCreateOrderPayload(base);
    expect(b).toMatchObject({
      domain: 'alice.xrp',
      payment_tx: 'A1B2C3',
      buyer: 'rBuyer',
      owner: 'rBuyer', // defaults to buyer
      issuer: 'rContract',
      receiver: 'rContract',
      amount: 30,
      price: 60,
      url: 'https://mainnet.xrpdomains.xyz/api/nftdomains/metadata/alice.xrp',
      uri: '',
      nftoken_id: '',
      adapter: 'x402',
      isVerify: true,
      extension: true,
      ismobile: false,
      setPrimary: false,
      payload_uuid: 'u-1',
      payment_currency: 'XRP',
    });
    expect(b.locked_rate).toBeUndefined();
  });

  it('respects an explicit owner (gift / on-behalf)', () => {
    expect(buildCreateOrderPayload({ ...base, owner: 'rGift' }).owner).toBe('rGift');
  });

  it('adds RLUSD fields when paying in RLUSD', () => {
    const b = buildCreateOrderPayload({
      ...base,
      currency: 'RLUSD',
      amount: 12.6,
      rlusd: {
        lockedRate: 2.1,
        lockedAt: 1785745200,
        lockedSource: 'coingecko',
        rlusdAmount: '12.60',
        rlusdIssuer: 'rMxCK',
        rlusdCurrencyCode: '524C555344000000000000000000000000000000',
      },
    });
    expect(b).toMatchObject({
      payment_currency: 'RLUSD',
      locked_rate: 2.1,
      rlusd_amount: '12.60',
      rlusd_issuer: 'rMxCK',
    });
  });

  it('throws if RLUSD info is missing', () => {
    expect(() => buildCreateOrderPayload({ ...base, currency: 'RLUSD' })).toThrow();
  });
});

describe('parseCreateOrderResponse', () => {
  it('flags success and extracts ids', () => {
    const r = parseCreateOrderResponse({
      status: true,
      msg: 'Success',
      data: { isOK: true, domain: 'alice.xrp', owner: 'rB', nftoken_id: '000800', offer_id: '5B3A', mint_tx: 'E1', create_offer_tx: 'F5' },
    });
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ offerId: '5B3A', nftokenId: '000800', mintTx: 'E1', createOfferTx: 'F5' });
  });

  it('is not ok when isOK is false or offer_id missing', () => {
    expect(parseCreateOrderResponse({ status: true, data: { isOK: false } }).ok).toBe(false);
    expect(parseCreateOrderResponse({ status: true, data: { isOK: true } }).ok).toBe(false);
  });
});

describe('buildAcceptOfferTemplate', () => {
  it('produces a signable NFTokenAcceptOffer with a hex-encoded domain memo', () => {
    const t = buildAcceptOfferTemplate('rBuyer', '5B3A', 'alice.xrp');
    expect(t).toMatchObject({ TransactionType: 'NFTokenAcceptOffer', Account: 'rBuyer', NFTokenSellOffer: '5B3A' });
    const memo = (t.Memos as { Memo: { MemoData: string } }[])[0].Memo.MemoData;
    expect(memo).toBe(Buffer.from('alice.xrp', 'utf8').toString('hex').toUpperCase());
  });
});
