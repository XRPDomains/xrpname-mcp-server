/**
 * Length-tier pricing — mirrors v3/search.html L641-697 exactly.
 * Source of truth stays the web app / backend; this is a read-side mirror
 * used by check_domains to display cost. (§17.5: backend pricing endpoint
 * is the long-term fix — replace this when it ships.)
 *
 * Tiers (multiplier × basePrice):
 *   1 char ×400 | 2 ×200 | 3 ×30 | 4 ×6 | 5-6 ×2 | 7-9 ×1.5 | 10+ ×1
 * Subname: flat 1 XRP, no discount.
 * Final = tier − discount%.
 */
export interface PricingConfig {
  basePriceXrp: number;
  discountPercent: number;
}

export function tierMultiplier(length: number): number {
  if (length <= 1) return 400;
  if (length === 2) return 200;
  if (length === 3) return 30;
  if (length === 4) return 6;
  if (length <= 6) return 2;
  if (length <= 9) return 1.5;
  return 1;
}

export function priceXrp(length: number, isSubname: boolean, cfg: PricingConfig): number {
  if (isSubname) return 1;
  const gross = cfg.basePriceXrp * tierMultiplier(length);
  const net = gross - (gross * cfg.discountPercent) / 100;
  return Math.round(net * 1e6) / 1e6;
}
