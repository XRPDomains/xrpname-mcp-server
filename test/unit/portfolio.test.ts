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
  const names = [
    'xrpdomains.xrp',
    'hello.777777.xrp',
    'payment.rlusd',
    'ab.xrp',
    'api/xrplnft/getAddress?domain=giveaway.xrp', // junk
  ];

  it('drops junk, marks primary, builds URLs', () => {
    const p = buildPortfolio('rOwner', names, 'xrpdomains.xrp', {
      sort: 'name-asc',
      filterTld: 'all',
      limit: 50,
      webBase: WEB,
    });
    expect(p.total).toBe(4); // junk removed
    expect(p.primary_domain).toBe('xrpdomains.xrp');
    const primary = p.domains.find((d) => d.domain === 'xrpdomains.xrp');
    expect(primary?.is_primary).toBe(true);
    expect(primary?.profile_url).toContain('/name/');
    expect(primary?.manage_url).toContain('/mydomains');
    expect(p.domains.every((d) => d.nftoken_id === null && d.minted_at === null)).toBe(true);
  });

  it('filters by TLD', () => {
    const p = buildPortfolio('rOwner', names, null, {
      sort: 'recent',
      filterTld: '.rlusd',
      limit: 50,
      webBase: WEB,
    });
    expect(p.total).toBe(1);
    expect(p.domains[0]?.domain).toBe('payment.rlusd');
    expect(p.domains[0]?.is_primary).toBe(false);
  });

  it('sorts by length ascending', () => {
    const p = buildPortfolio('rOwner', names, null, {
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
    const p = buildPortfolio('rOwner', names, null, {
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
