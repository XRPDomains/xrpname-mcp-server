import { describe, it, expect } from 'vitest';
import { buildRecommendations } from '../../src/tools/recommend-domain.js';

const OPTS = { basePriceXrp: 10, discountPercent: 50, webBase: 'https://xrpdomains.xyz' };

describe('buildRecommendations', () => {
  it('merges availability + price + register link', () => {
    const out = buildRecommendations(
      [
        { name: 'tomxrp', tld: '.xrp', category: 'prefix' },
        { name: 'tomfi', tld: '.xrpfi', category: 'related' },
      ],
      [
        { domain: 'tomxrp.xrp', status: 'available' },
        { domain: 'tomfi.xrpfi', status: 'registered' },
      ],
      OPTS,
    );

    expect(out[0]).toMatchObject({
      domain: 'tomxrp.xrp',
      tld: '.xrp',
      category: 'prefix',
      available: true,
      price_xrp: 10, // 6 chars → ×2 − 50% = 10
    });
    expect(out[0]?.register_url).toContain('/search?q=tomxrp.xrp');
    expect(out[1]).toMatchObject({ domain: 'tomfi.xrpfi', available: false, price_xrp: null });
  });

  it('defaults to available when not in the checks map', () => {
    const out = buildRecommendations(
      [{ name: 'brandnew', tld: '.xrp', category: 'brand' }],
      [],
      OPTS,
    );
    expect(out[0]?.available).toBe(true);
    expect(out[0]?.price_xrp).toBeGreaterThan(0);
  });
});
