import { describe, it, expect } from 'vitest';
import { normalizePortfolioPage } from '../../src/lib/portfolio.js';

describe('normalizePortfolioPage', () => {
  it('Shape A — flat string list', () => {
    const r = normalizePortfolioPage({
      status: true,
      count: 3,
      data: ['alice.xrp', 'bob.xrpfi', 'pay.rlusd'],
    });
    expect(r.total).toBe(3);
    expect(r.limit).toBeNull();
    expect(r.primaryDomain).toBeNull();
    expect(r.hasNext).toBe(false);
    expect(r.entries).toEqual([
      { domain: 'alice.xrp', nftokenId: null, isPrimary: false, imageUrl: null, mintedAt: null },
      { domain: 'bob.xrpfi', nftokenId: null, isPrimary: false, imageUrl: null, mintedAt: null },
      { domain: 'pay.rlusd', nftokenId: null, isPrimary: false, imageUrl: null, mintedAt: null },
    ]);
  });

  it('Shape B — rich paginated object list', () => {
    const r = normalizePortfolioPage({
      status: true,
      total: 73,
      limit: 50,
      page: 1,
      total_pages: 2,
      has_next: true,
      primary_domain: 'xrpdomains.xrp',
      owner: 'rOwner',
      data: [
        {
          is_primary: true,
          nftoken_id: 'NFT123',
          domain: 'xrpdomains.xrp',
          metadata: { image: 'https://x/img.png', createtime: '2025-01-23T05:36:40.252+01:00' },
        },
        {
          is_primary: false,
          nftoken_id: 'NFT456',
          domain: 'thelos.xrpl',
          metadata: { image: 'https://x/thelos.png', createtime: '2025-04-16T17:26:23.7346063+02:00' },
        },
      ],
    });
    expect(r.total).toBe(73);
    expect(r.limit).toBe(50);
    expect(r.primaryDomain).toBe('xrpdomains.xrp');
    expect(r.hasNext).toBe(true);
    expect(r.entries[0]).toEqual({
      domain: 'xrpdomains.xrp',
      nftokenId: 'NFT123',
      isPrimary: true,
      imageUrl: 'https://x/img.png',
      mintedAt: Math.floor(Date.parse('2025-01-23T05:36:40.252+01:00') / 1000),
    });
    expect(r.entries[1]?.isPrimary).toBe(false);
    expect(r.entries[1]?.nftokenId).toBe('NFT456');
  });

  it('handles objects missing domain or metadata gracefully', () => {
    const r = normalizePortfolioPage({
      data: [
        { nftoken_id: 'X' }, // no domain → skipped
        { domain: 'ok.xrp' }, // no metadata → nulls
      ],
    });
    expect(r.entries).toEqual([
      { domain: 'ok.xrp', nftokenId: null, isPrimary: false, imageUrl: null, mintedAt: null },
    ]);
  });

  it('returns empty for a bad payload', () => {
    expect(normalizePortfolioPage(null).entries).toEqual([]);
    expect(normalizePortfolioPage({ data: 'nope' }).entries).toEqual([]);
  });
});
