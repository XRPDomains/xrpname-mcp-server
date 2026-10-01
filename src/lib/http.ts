/**
 * http.ts — one place for the "fetch with an abort timeout" pattern that was
 * previously hand-rolled at every network call site (api client, facilitator,
 * rate sources, admin ping). The timeout scopes the request (connection +
 * response headers); callers read the body after it resolves.
 */

/** fetch() that aborts after `ms` milliseconds. Clears the timer in all cases. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
