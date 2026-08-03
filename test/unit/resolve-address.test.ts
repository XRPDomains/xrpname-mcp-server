import { describe, it, expect } from 'vitest';
import { toResolvedDomain } from '../../src/tools/resolve-address.js';
import type { PortfolioEntry } from '../../src/lib/portfolio.js';

const WEB = 'https://xrpdomains.xyz';
const entry = (over: Partial<PortfolioEntry> = {}): PortfolioEntry => ({
  domain: 'alice.xrp',
  nftokenId: null,
  isPrimary: false,
  imageUrl: null,
  mintedAt: null,
  ...over,
});

describe('toResolvedDomain', () => {
  it('derives tld + length and profile_url', () => {
    const r = toResolvedDomain(entry({ domain: 'alice.xrpfi' }), null, WEB, false);
    expect(r).toMatchObject({
      domain: 'alice.xrpfi',
      tld: '.xrpfi',
      length: 5,
      profile_url: 'https://xrpdomains.xyz/name/alice.xrpfi',
    });
  });

  it('marks is_primary when the domain equals the wallet primary', () => {
    expect(toResolvedDomain(entry({ domain: 'alice.xrp' }), 'alice.xrp', WEB, false).is_primary).toBe(true);
    expect(toResolvedDomain(entry({ domain: 'alice.xrpfi' }), 'alice.xrp', WEB, false).is_primary).toBe(false);
  });

  it('marks is_primary from the entry flag too', () => {
    expect(toResolvedDomain(entry({ isPrimary: true }), null, WEB, false).is_primary).toBe(true);
  });

  it('counts subname length excluding the tld', () => {
    expect(toResolvedDomain(entry({ domain: 'sub.bob.xrp' }), null, WEB, false).length).toBe(7);
  });

  it('omits history fields by default', () => {
    const r = toResolvedDomain(entry({ nftokenId: '00080abc', mintedAt: 1747215131 }), null, WEB, false);
    expect(r.nftoken_id).toBeUndefined();
    expect(r.mint_date).toBeUndefined();
  });

  it('includes history fields when requested (mint date as ISO)', () => {
    const r = toResolvedDomain(entry({ nftokenId: '00080abc', mintedAt: 1747215131 }), null, WEB, true);
    expect(r.nftoken_id).toBe('00080abc');
    expect(r.mint_date).toBe('2025-05-14T09:32:11.000Z');
  });

  it('history fields are null when the entry lacks them', () => {
    const r = toResolvedDomain(entry({ nftokenId: null, mintedAt: null }), null, WEB, true);
    expect(r.nftoken_id).toBeNull();
    expect(r.mint_date).toBeNull();
  });
});
