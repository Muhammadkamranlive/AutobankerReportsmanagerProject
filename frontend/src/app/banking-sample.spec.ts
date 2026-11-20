import { generateBankingSample, localBusinessDate } from './banking-sample';

describe('synthetic banking sample', () => {
  const date = new Date(2026, 9, 28, 23, 55);
  it('uses the local date and is repeatable with a fresh result each time', () => {
    expect(localBusinessDate(date)).toBe('2026-10-28');
    const first = generateBankingSample(date), second = generateBankingSample(date);
    expect(first).toEqual(second);
    expect(first.Branches).not.toBe(second.Branches);
    expect(() => localBusinessDate(new Date(NaN))).toThrow();
  });
  it('derives large-volume counters and amounts from actual generated events', () => {
    const counts = { account: 0, wallet: 0, transaction: 0, vault: 0, atm: 0, debits: 0, credits: 0, cashIn: 0, cashOut: 0 };
    const data = generateBankingSample(date, event => {
      counts[event.kind]++;
      expect(event.businessDate).toBe('2026-10-28');
      if (event.kind === 'transaction') { counts[event.direction === 'in' ? 'credits' : 'debits'] += event.amountCents; if (event.atm) counts.atm++; }
      if (event.kind === 'vault') counts[event.direction === 'in' ? 'cashIn' : 'cashOut'] += event.amountCents;
    });
    expect(counts.account).toBeGreaterThanOrEqual(5000);
    expect(counts.wallet).toBeGreaterThanOrEqual(2000);
    expect(counts.transaction).toBeGreaterThanOrEqual(10000);
    expect(data.Totals['accountsOpened']).toBe(counts.account);
    expect(data.Totals['walletsOpened']).toBe(counts.wallet);
    expect(data.Totals['transactions']).toBe(counts.transaction);
    expect(data.Totals['atmTransactions']).toBe(counts.atm);
    expect(data.Totals['debits']).toBe(counts.debits / 100);
    expect(data.Totals['credits']).toBe(counts.credits / 100);
    expect(data.Totals['vaultCashIn']).toBe(counts.cashIn / 100);
    expect(data.Totals['vaultCashOut']).toBe(counts.cashOut / 100);
    expect(counts.vault).toBe(960);
  });
  it('reconciles all branches, totals and hours and keeps raw events out of export data', () => {
    const data = generateBankingSample(date);
    expect(data.Branches).toHaveLength(12);
    for (const row of data.Branches) {
      expect(row.businessDate).toBe(data.BusinessDate);
      expect(Math.round(row.closingBalance * 100)).toBe(Math.round(row.openingBalance * 100) + Math.round(row.credits * 100) - Math.round(row.debits * 100));
      expect(Math.round(row.vaultClosing * 100)).toBe(Math.round(row.vaultOpening * 100) + Math.round(row.vaultCashIn * 100) - Math.round(row.vaultCashOut * 100));
    }
    for (const field of ['accountsOpened', 'walletsOpened', 'transactions', 'atmTransactions']) {
      expect(data.Branches.reduce((sum, row) => sum + Number(row[field]), 0)).toBe(data.Totals[field]);
      expect(data.Hours.reduce((sum, row) => sum + Number(row[field]), 0)).toBe(data.Totals[field]);
    }
    const minor = data['MinorUnitTotals'] as Record<string, number>;
    expect(minor['closingBalance']).toBe(minor['openingBalance'] + minor['credits'] - minor['debits']);
    expect(minor['vaultClosing']).toBe(minor['vaultOpening'] + minor['vaultCashIn'] - minor['vaultCashOut']);
    expect(JSON.stringify(data).length).toBeLessThan(40000);
    expect(data['Transactions']).toBeUndefined();
  });
});