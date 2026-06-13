/**
 * Error classifier — §11.2 categories.
 * Tool handlers throw McpToolError; the dispatcher converts to
 * { isError: true, content: [...] } so the LLM can relay the message.
 */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'DOMAIN_NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'OFFER_NOT_FOUND'
  | 'WALLET_NOT_AUTHENTICATED'
  | 'RATE_LIMITED'
  | 'BACKEND_UNAVAILABLE'
  | 'XRPL_NETWORK_ERROR'
  | 'LEDGER_REJECTED'
  | 'UNKNOWN';

export class McpToolError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

export function toErrorResult(err: unknown): { isError: true; content: [{ type: 'text'; text: string }] } {
  if (err instanceof McpToolError) {
    return { isError: true, content: [{ type: 'text', text: `[${err.code}] ${err.message}` }] };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: 'text', text: `[UNKNOWN] ${msg}` }] };
}
