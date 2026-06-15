import { describe, it, expect } from 'vitest';
import { mapHistory } from '../../src/tools/get-domain-profile.js';

describe('mapHistory', () => {
  it('maps the live getAddress?include=history shape', () => {
    const raw = [
      {
        owner: 'rLhi87aSCyNW88tW4632yLiwinbghFZNue',
        changedAt: 1678942640,
        ledgerIndex: 78447588,
        txHash: 'C56DD319',
        offerIndex: '597FA5',
        amount: '0',
        ownerDetails: { username: null, service: null },
      },
      {
        owner: 'raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9',
        changedAt: 1678942611,
        ledgerIndex: 78447581,
        txHash: 'BD5533B7',
        marketplace: 'xrpdomains.xyz',
        ownerDetails: { username: 'xrpdomains', service: 'xrpdomains.xyz' },
      },
    ];
    expect(mapHistory(raw)).toEqual([
      {
        owner: 'rLhi87aSCyNW88tW4632yLiwinbghFZNue',
        changed_at: 1678942640,
        ledger_index: 78447588,
        tx_hash: 'C56DD319',
        marketplace: null,
        owner_username: null,
      },
      {
        owner: 'raAyazbgEkwzLByXipQuPLWFfnsPS1v1q9',
        changed_at: 1678942611,
        ledger_index: 78447581,
        tx_hash: 'BD5533B7',
        marketplace: 'xrpdomains.xyz',
        owner_username: 'xrpdomains',
      },
    ]);
  });

  it('handles malformed entries gracefully', () => {
    expect(mapHistory([null, 'x', {}])).toEqual([
      { owner: null, changed_at: null, ledger_index: null, tx_hash: null, marketplace: null, owner_username: null },
      { owner: null, changed_at: null, ledger_index: null, tx_hash: null, marketplace: null, owner_username: null },
      { owner: null, changed_at: null, ledger_index: null, tx_hash: null, marketplace: null, owner_username: null },
    ]);
  });
});
