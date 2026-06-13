/**
 * Domain normalisation + validation for .xrp / .xrpfi / .xrpl.
 * Charset mirrors v3/js/v3-nft-tx.js RE_NAME: [a-z0-9_-]
 * Spec ref: §8.1, §14.1
 */
export const TLDS = ['.xrp', '.xrpfi', '.xrpl'] as const;
export type Tld = (typeof TLDS)[number];

const LABEL_RE = /^[a-z0-9_-]+$/;
export const XRPL_ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export interface ValidDomain {
  ok: true;
  /** Normalised full domain, e.g. "nftcafe.xrp" or "mail.alice.xrp" */
  domain: string;
  /** Name part without TLD, e.g. "nftcafe" or "mail.alice" */
  name: string;
  tld: Tld;
  /** Length of the registrable label (first label for subnames) */
  length: number;
  isSubname: boolean;
}

export interface InvalidDomain {
  ok: false;
  input: string;
  reason: string;
}

export type DomainResult = ValidDomain | InvalidDomain;

/**
 * Normalise user input into a canonical domain.
 * - lowercases, trims
 * - TLD optional → defaults to .xrp
 * - "mail.alice.xrp" → subname
 */
export function parseDomain(rawInput: string): DomainResult {
  const input = String(rawInput ?? '').trim();
  const lower = input.toLowerCase();

  if (!lower) return { ok: false, input, reason: 'Empty domain' };
  if (lower.startsWith('.') || lower.endsWith('.')) {
    return { ok: false, input, reason: 'Domain must not start or end with a dot' };
  }

  let tld: Tld = '.xrp';
  let name = lower;
  const matched = TLDS.find((t) => lower.endsWith(t));
  if (matched) {
    tld = matched;
    name = lower.slice(0, -matched.length);
  }

  if (!name) return { ok: false, input, reason: 'Missing name before TLD' };
  if (name.endsWith('.')) return { ok: false, input, reason: 'Missing name before TLD' };

  const labels = name.split('.');
  for (const label of labels) {
    if (!label) return { ok: false, input, reason: 'Empty label (consecutive dots)' };
    if (!LABEL_RE.test(label)) {
      return {
        ok: false,
        input,
        reason: `Invalid characters in "${label}" — allowed: a-z, 0-9, _ and -`,
      };
    }
  }

  if (labels.length > 2) {
    return { ok: false, input, reason: 'Too many levels — max one subname level (a.b.xrp)' };
  }

  const isSubname = labels.length === 2;
  const registrable = labels[0] as string;

  return {
    ok: true,
    domain: `${name}${tld}`,
    name,
    tld,
    length: registrable.length,
    isSubname,
  };
}

export function isXrplAddress(input: string): boolean {
  return XRPL_ADDRESS_RE.test(String(input ?? '').trim());
}
