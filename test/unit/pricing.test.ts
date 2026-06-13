import { describe, it, expect } from 'vitest';
import { priceXrp, tierMultiplier } from '../../src/lib/pricing.js';

// Mirrors v3/search.html L641-697: base 10, discount 50
const cfg = { basePriceXrp: 10, discountPercent: 50 };

describe('tierMultiplier', () => {
  it('matches search.html tiers', () => {
    expect(tierMultiplier(1)).toBe(400);
    expect(tierMultiplier(2)).toBe(200);
    expect(tierMultiplier(3)).toBe(30);
    expect(tierMultiplier(4)).toBe(6);
    expect(tierMultiplier(5)).toBe(2);
    expect(tierMultiplier(6)).toBe(2);
    expect(tierMultiplier(7)).toBe(1.5);
    expect(tierMultiplier(9)).toBe(1.5);
    expect(tierMultiplier(10)).toBe(1);
    expect(tierMultiplier(25)).toBe(1);
  });
});

describe('priceXrp', () => {
  it('applies discount', () => {
    expect(priceXrp(10, false, cfg)).toBe(5); // 10 × 1 − 50%
    expect(priceXrp(7, false, cfg)).toBe(7.5); // 10 × 1.5 − 50%
    expect(priceXrp(3, false, cfg)).toBe(150); // 10 × 30 − 50%
    expect(priceXrp(1, false, cfg)).toBe(2000); // 10 × 400 − 50%
  });

  it('subname is flat 1 XRP, no discount', () => {
    expect(priceXrp(4, true, cfg)).toBe(1);
  });

  it('zero discount passthrough', () => {
    expect(priceXrp(10, false, { basePriceXrp: 10, discountPercent: 0 })).toBe(10);
  });
});
