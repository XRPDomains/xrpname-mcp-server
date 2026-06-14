import { describe, it, expect } from 'vitest';
import { parsePortfolioName, buildPortfolio } from '../../src/tools/get-portfolio.js';

const WEB = 'https://xrpdomains.xyz';

describe('parsePortfolioName', () => {
  it('parses a plain domain', () => {
    expect(parsePortfolioName('xrpdomains.xrp')).toEqual({
      domain: 'xrpdomains.xrp',
      tld: '.xrp',
      length: 10,
      isSubname: false,
    });
  });

  it('flags a subname and counts the first label length', () => {
    expect(parsePortfolioName('hello.777777.xrp')).toEqual({
      domain: 'hello.777777.xrp',
      tld: '.xrp',
      length: 5,
      isSubname: true,
    });
  });

  it('keeps exotic TLDs (.rlusd, .xrpfi)', () => {
    expect(parsePortfolioName('payment.rlusd')?.tld).toBe('.rlusd');
    expect(parsePortfolioName('claude-code.xrpfi')?.tld).toBe('.xrpfi');
  });

  it('keeps emoji/unicode domains', () => {
    const p = parsePortfolioName('we❤️xrp.xrp');
    expect(p).not.toBeNull();
    expect(p?.tld).toBe('.xrp');
    expect(p?.isSubname).toBe(false);
  });

  it('rejects junk entries from the backend', () => {
    expect(parsePortfolioName('api/xrplnft/getAddress?domain=giveaway.xrp')).toBeNull();
    expect(parsePortfolioName('bad name.xrp')).toBeNull(); // whitespace
    expect(parsePortfolioName('.xrp')).toBeNull();
    expect(parsePortfolioName('notld')).toBeNull();
    expect(parsePortfolioName('')).toBeNull();
    expect(parsePortfolioName('a..b.xrp')).toBeNull(); // empty label
  });
});

describe('buildPortfolio', () => {
  /** Helper: build a PortfolioEntry with optional rich fields. */
  const e = (domain: string, extra: Partial<import('../../src/lib/portfolio.js').PortfolioEntry> = {}) => ({
    domain,
    nftokenId: null,
    isPrimary: false,
    imageUrl: null,
    mintedAt: null,
    ...extra,
  });

  const entries = [
    e('xrpdomains.xrp', { nftokenId: 'NFT1', imageUrl: 'https://x/a.png', mintedAt: 1700000000, isPrimary: true }),
    e('hello.777777.xrp'),
    e('payment.rlusd'),
    e('ab.xrp'),
    e('api/xrplnft/getAddress?domain=giveaway.xrp'), // junk
  ];

  it('drops junk, fills rich fields, marks primary, builds URLs', () => {
    const p = buildPortfolio('rOwner', entries, 'xrpdomains.xrp', {
      sort: 'name-asc',
      filterTld: 'all',
      limit: 50,
      webBase: WEB,
      reportedTotal: 5,
    });
    expect(p.total).toBe(4); // junk removed
    expect(p.skipped).toBe(1); // the stray getAddress entry
    expect(p.owner_total).toBe(5);
    expect(p.primary_domain).toBe('xrpdomains.xrp');
    const primary = p.domains.find((d) => d.domain === 'xrpdomains.xrp');
    expect(primary?.is_primary).toBe(true);
    expect(primary?.nftoken_id).toBe('NFT1');
    expect(primary?.image_url).toBe('https://x/a.png');
    expect(primary?.minted_at).toBe(1700000000);
    expect(primary?.profile_url).toContain('/name/');
    expect(primary?.manage_url).toContain('/mydomains');
  });

  it('uses entry.isPrimary even without a primary arg', () => {
    const p = buildPortfolio('rOwner', entries, null, {
      sort: 'name-asc',
      filterTld: 'all',
      limit: 50,
      webBase: WEB,
    });
    expect(p.domains.find((d) => d.domain === 'xrpdomains.xrp')?.is_primary).toBe(true);
  });

  it('filters by TLD', () => {
    const p = buildPortfolio('rOwner', entries, null, {
      sort: 'recent',
      filterTld: '.rlusd',
      limit: 50,
      webBase: WEB,
    });
    expect(p.total).toBe(1);
    expect(p.domains[0]?.domain).toBe('payment.rlusd');
  });

  it('sorts by length ascending', () => {
    const p = buildPortfolio('rOwner', entries, null, {
      sort: 'length-asc',
      filterTld: 'all',
      limit: 50,
      webBase: WEB,
    });
    expect(p.domains.map((d) => d.domain)).toEqual([
      'ab.xrp', // 2
      'hello.777777.xrp', // 5
      'payment.rlusd', // 7
      'xrpdomains.xrp', // 10
    ]);
  });

  it('applies the limit but reports full total', () => {
    const p = buildPortfolio('rOwner', entries, null, {
      sort: 'name-asc',
      filterTld: 'all',
      limit: 2,
      webBase: WEB,
    });
    expect(p.total).toBe(4);
    expect(p.returned).toBe(2);
    expect(p.domains).toHaveLength(2);
  });
});
