/**
 * Web fallback URL builder — every TX-related response must include a
 * web_url so the user can finish in browser. Spec ref: kickoff constraint #5.
 */
export interface WebUrlOptions {
  webBase: string;
}

export function searchUrl(domain: string, opts: WebUrlOptions, refcode?: string | null): string {
  const u = new URL('/search', opts.webBase);
  // `?q=` is the param that actually runs the search + shows Register buttons;
  // `?prefill=` only pre-fills the box without executing (verified live 2026-07).
  u.searchParams.set('q', domain);
  if (refcode) u.searchParams.set('refcode', refcode);
  return u.toString();
}

export function profileUrl(domain: string, opts: WebUrlOptions): string {
  return new URL(`/name/${encodeURIComponent(domain)}`, opts.webBase).toString();
}

export function myDomainsUrl(opts: WebUrlOptions): string {
  return new URL('/mydomains', opts.webBase).toString();
}
