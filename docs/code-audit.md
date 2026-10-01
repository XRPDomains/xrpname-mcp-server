# Code audit — xrpname-mcp-server

**Scope:** whole project (`src/`, 38 TS files, ~5,130 LOC)
**Method:** OpenCodeReview (`ocr`) delegation ruleset + `tsc --noUnusedLocals --noUnusedParameters` + static duplication/dead-code/perf scans + manual review.
**Verdict:** clean codebase. No performance red flags, no junk variables, no dead exports. Two worthwhile de-duplication refactors + two tiny cleanups.

---

## Findings (actionable)

### 1. Duplication — hand-rolled `fetch` + timeout appears 5× in 2 files  · **medium**
Every network call re-implements the same `AbortController` + `setTimeout(abort)` + `clearTimeout` dance:
- `src/clients/xrpdomains-api.ts` — `fetchJson` (47), `postJson` (73), `getXrpUsdRate` (293), `notifyRegistration` (330)
- `src/lib/x402.ts` — `settleWithFacilitator` (162)

**Fix:** extract one helper, e.g. `src/lib/http.ts`:
```ts
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
```
Collapses ~5 copies into one; one place to tune timeout/retry/telemetry later.

### 2. Duplication — salted SHA-256 repeated in `analytics.ts` (6 sites)  · **low-medium**
`src/lib/analytics.ts` lines 328, 333, 344, 358, **519**, **547**. Lines **519 and 547 are byte-identical**:
```ts
cid: 'c_' + createHash('sha256').update(this.store.salt + '|' + (evt.payer || '')).digest('hex').slice(0, 8),
```
**Fix:** one private helper and reuse it:
```ts
private salted(input: string, len: number): string {
  return createHash('sha256').update(this.store.salt + '|' + input).digest('hex').slice(0, len);
}
private payerCid(payer?: string | null): string { return 'c_' + this.salted(payer || '', 8); }
```
Then `cidFor`, `auditHash`, `clientHash` and both payer-cid lines call it.

### 3. Dead code — unused `geoHtml()` in the stats page  · **low**
`src/lib/stats-page.ts:369` — `geoHtml()` is no longer called (replaced by `clientCell()` when the activity table was merged). It lives inside the page's `<script>` string, so `tsc` can't see it. **Remove it.**

### 4. Nested ternary — OCR rule violation  · **low**
`src/lib/stats-page.ts:405`:
```js
return auditFilter==='all'?true:auditFilter==='x402'?isX402(e):!isX402(e);
```
Flatten:
```js
if (auditFilter === 'all') return true;
return auditFilter === 'x402' ? isX402(e) : !isX402(e);
```

### 5. Minor — XRPL address char-class duplicated  · **nit**
The `r[1-9A-HJ-NP-Za-km-z]{24,34}` pattern is written twice: `analytics.ts:258` (global, for shortening) and `domain-validator.ts:10` (`XRPL_ADDRESS_RE`, anchored). Optionally share the char-class as one exported constant.

---

## Verified clean (no action)

- **Junk / unused variables:** `tsc --noUnusedLocals --noUnusedParameters` reports **nothing** — no stray locals, params, or imports anywhere in `src/`.
- **Dead exports:** every exported symbol is used locally, by a test, or cross-file (initial "unused export" hits were all test helpers or same-file use — false positives).
- **Performance / flow:**
  - No `await` inside loops on the hot path; the only sequential loop is the rate-source fallback in `getXrpUsdRate` (intentional — try sources in order).
  - Portfolio and multi-domain lookups use bounded concurrency (`mapLimit`), not unbounded `Promise.all` or serial awaits.
  - No synchronous I/O on the request path; analytics persistence is debounced + atomic (`tmp` + `rename`).
  - x402 pricing is server-authoritative and the RLUSD quote is cache-locked per invoice — no recompute drift.
- **Safety:** no `eval`/`Function`, no `innerHTML` with untrusted input (dashboard escapes via `esc()` and shortens addresses), no secrets in code (issuer/currency are config defaults with env overrides; wallet seed stays client-side).
- **Style:** no loose `==`/`!=` and no `any` in the TypeScript. (The embedded browser script in `stats-page.ts` deliberately uses ES5 `var` / `== null` for old-browser reach — not application TS; left as-is by design.)

---

## Suggested order

1. Apply #3 and #4 (trivial, zero-risk) — already isolated to `stats-page.ts`.
2. Apply #1 (`fetchWithTimeout`) — mechanical, well covered by existing network behavior.
3. Apply #2 (salted-hash helper) — pure refactor, keep output byte-identical (same algorithm + slice lengths) so client ids/hashes don't change.
4. #5 at leisure.

No behavioral changes in any of the above — all are refactors/cleanups.
