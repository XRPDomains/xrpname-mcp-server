import { describe, it, expect } from 'vitest';
import {
  buildTransferOffer,
  buildAcceptOffer,
  buildCancelOffer,
  buildBurn,
  FEE_DROPS,
  TF_SELL_NFTOKEN,
} from '../../src/lib/tx-build.js';

describe('buildTransferOffer', () => {
  it('builds an NFTokenCreateOffer sell offer (Amount 0, tfSellNFToken)', () => {
    const b = buildTransferOffer({ owner: 'rOwner', nftokenId: 'NFT1', destination: 'rDest' });
    expect(b.tx_json).toEqual({
      TransactionType: 'NFTokenCreateOffer',
      Account: 'rOwner',
      NFTokenID: 'NFT1',
      Amount: '0',
      Destination: 'rDest',
      Flags: TF_SELL_NFTOKEN,
      Fee: FEE_DROPS,
    });
    expect(b.method_hint).toBe('createNFTOffer');
    expect(b.walletPayload.transactionType).toBe('NFTokenCreateOffer');
    expect(b.walletPayload.destination).toBe('rDest');
  });
});

describe('buildAcceptOffer', () => {
  it('builds an NFTokenAcceptOffer with the sell offer id', () => {
    const b = buildAcceptOffer({ account: 'rMe', offerId: 'OFFER1' });
    expect(b.tx_json).toEqual({
      TransactionType: 'NFTokenAcceptOffer',
      Account: 'rMe',
      NFTokenSellOffer: 'OFFER1',
      Fee: FEE_DROPS,
    });
    expect(b.method_hint).toBe('acceptNFTOffer');
  });
});

describe('buildCancelOffer', () => {
  it('builds an NFTokenCancelOffer with a list of offers', () => {
    const b = buildCancelOffer({ account: 'rMe', offerIds: ['O1', 'O2'] });
    expect(b.tx_json).toEqual({
      TransactionType: 'NFTokenCancelOffer',
      Account: 'rMe',
      NFTokenOffers: ['O1', 'O2'],
      Fee: FEE_DROPS,
    });
  });
});

describe('buildBurn', () => {
  it('builds an NFTokenBurn', () => {
    const b = buildBurn({ owner: 'rOwner', nftokenId: 'NFT9' });
    expect(b.tx_json).toEqual({
      TransactionType: 'NFTokenBurn',
      Account: 'rOwner',
      NFTokenID: 'NFT9',
      Fee: FEE_DROPS,
    });
    expect(b.method_hint).toBe('burnNFT');
  });
});

describe('constants', () => {
  it('fixed 12-drop fee and sell flag', () => {
    expect(FEE_DROPS).toBe('12');
    expect(TF_SELL_NFTOKEN).toBe(1);
  });
});
