/**
 * Encode an unsigned tx_json field-map to a hex blob.
 *
 * Kept separate from `tx-build.ts` (which stays dependency-free for offline
 * tests) and centralises the one cast to xrpl's strict `Transaction` type — our
 * builders emit valid XRPL field maps, so the cast is sound at runtime.
 */
import { encode } from 'xrpl';

export function encodeTx(txJson: Record<string, unknown>): string {
  return encode(txJson as unknown as Parameters<typeof encode>[0]);
}
