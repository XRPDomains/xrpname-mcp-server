/**
 * Lazy XRPL client wrapper. Connects on first use, reconnects if dropped.
 * Used by check_tx_status (Phase 1) and send_signed_tx (Buoc 4).
 */
import { Client } from 'xrpl';
import { McpToolError } from '../lib/errors.js';

export type TxStatus = 'validated' | 'failed' | 'pending' | 'not_found';

export interface TxStatusResult {
  tx_hash: string;
  status: TxStatus;
  engine_result: string | null;
  validated: boolean;
  ledger_index: number | null;
}

export class XrplClient {
  private client: Client;

  constructor(wssUrl: string) {
    this.client = new Client(wssUrl);
  }

  private async ensureConnected(): Promise<Client> {
    if (!this.client.isConnected()) {
      try {
        await this.client.connect();
      } catch {
        throw new McpToolError('XRPL_NETWORK_ERROR', 'Could not connect to the XRPL network.');
      }
    }
    return this.client;
  }

  async getTxStatus(txHash: string): Promise<TxStatusResult> {
    const client = await this.ensureConnected();
    try {
      const r = await client.request({ command: 'tx', transaction: txHash });
      const result = r.result as unknown as Record<string, unknown>;
      const validated = result.validated === true;
      const meta = result.meta as { TransactionResult?: string } | undefined;
      const engine = meta?.TransactionResult ?? null;
      const status: TxStatus = !validated
        ? 'pending'
        : engine === 'tesSUCCESS'
          ? 'validated'
          : 'failed';
      return {
        tx_hash: txHash,
        status,
        engine_result: engine,
        validated,
        ledger_index: typeof result.ledger_index === 'number' ? result.ledger_index : null,
      };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes('txnNotFound')) {
        return {
          tx_hash: txHash,
          status: 'not_found',
          engine_result: null,
          validated: false,
          ledger_index: null,
        };
      }
      if (err instanceof McpToolError) throw err;
      throw new McpToolError('XRPL_NETWORK_ERROR', `XRPL lookup failed: ${msg}`);
    }
  }


  async isReachable(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client.isConnected()) await this.client.disconnect();
  }
}
