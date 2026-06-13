import { describe, it, expect } from 'vitest';
import { parseDomain, isXrplAddress } from '../../src/lib/domain-validator.js';

describe('parseDomain', () => {
  it('defaults to .xrp when TLD omitted', () => {
    const r = parseDomain('nftcafe');
    expect(r).toMatchObject({ ok: true, domain: 'nftcafe.xrp', tld: '.xrp', length: 7, isSubname: false });
  });

  it('keeps explicit TLDs', () => {
    expect(parseDomain('foo.xrpfi')).toMatchObject({ ok: true, domain: 'foo.xrpfi', tld: '.xrpfi' });
    expect(parseDomain('foo.xrpl')).toMatchObject({ ok: true, domain: 'foo.xrpl', tld: '.xrpl' });
  });

  it('lowercases and trims', () => {
    expect(parseDomain('  NFTCafe.XRP ')).toMatchObject({ ok: true, domain: 'nftcafe.xrp' });
  });

  it('detects subnames and uses first label length', () => {
    const r = parseDomain('mail.alice.xrp');
    expect(r).toMatchObject({ ok: true, domain: 'mail.alice.xrp', isSubname: true, length: 4 });
  });

  it('rejects bad charset', () => {
    expect(parseDomain('héllo.xrp')).toMatchObject({ ok: false });
    expect(parseDomain('has space.xrp')).toMatchObject({ ok: false });
    expect(parseDomain('emoji😀.xrp')).toMatchObject({ ok: false });
  });

  it('rejects empties and dot abuse', () => {
    expect(parseDomain('')).toMatchObject({ ok: false });
    expect(parseDomain('.xrp')).toMatchObject({ ok: false });
    expect(parseDomain('foo..xrp')).toMatchObject({ ok: false });
    expect(parseDomain('foo.xrp.')).toMatchObject({ ok: false });
    expect(parseDomain('a.b.c.xrp')).toMatchObject({ ok: false });
  });

  it('allows underscore and hyphen', () => {
    expect(parseDomain('a_b-c.xrp')).toMatchObject({ ok: true, length: 5 });
  });
});

describe('isXrplAddress', () => {
  it('accepts classic r-addresses', () => {
    expect(isXrplAddress('raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9')).toBe(true);
  });
  it('rejects others', () => {
    expect(isXrplAddress('alice.xrp')).toBe(false);
    expect(isXrplAddress('0xabc')).toBe(false);
  });
});
