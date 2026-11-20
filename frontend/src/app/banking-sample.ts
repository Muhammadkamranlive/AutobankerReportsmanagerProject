export interface BankingBranch extends Record<string, unknown> {
  branchCode: string; branchName: string; businessDate: string;
  accountsOpened: number; walletsOpened: number; transactions: number;
  debits: number; credits: number; openingBalance: number; closingBalance: number;
  atmTransactions: number; atmAmount: number;
  vaultOpening: number; vaultCashIn: number; vaultCashOut: number; vaultClosing: number;
}
export interface BankingEvent {
  kind: 'account' | 'wallet' | 'transaction' | 'vault';
  businessDate: string; branchCode: string; hour: string;
  amountCents: number; direction: 'in' | 'out'; atm: boolean;
}
export interface BankingSample extends Record<string, unknown> {
  BusinessDate: string; Currency: string; Synthetic: boolean; Methodology: string;
  Branches: BankingBranch[]; Hours: Record<string, unknown>[]; Totals: Record<string, number>;
}

export function localBusinessDate(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid business date');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function generateBankingSample(date = new Date(), visit?: (event: BankingEvent) => void): BankingSample {
  const businessDate = localBusinessDate(date);
  let seed = 271828;
  const random = (maximum: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % maximum; };
  const names = ['Central', 'Riverside', 'North Park', 'East Market', 'West End', 'Harbor', 'Airport', 'University', 'South Gate', 'Hillcrest', 'Lakeside', 'Industrial'];
  const moneyFields = ['debits', 'credits', 'openingBalance', 'closingBalance', 'atmAmount', 'vaultOpening', 'vaultCashIn', 'vaultCashOut', 'vaultClosing'];
  const fields = ['accountsOpened', 'walletsOpened', 'transactions', ...moneyFields, 'atmTransactions'];
  const hourly = Array.from({ length: 12 }, (_, index) => ({ hour: `${String(index + 8).padStart(2, '0')}:00`, businessDate, accountsOpened: 0, walletsOpened: 0, transactions: 0, debits: 0, credits: 0, atmTransactions: 0, atmAmount: 0 }));
  const branchCents = names.map((branchName, index) => {
    const branchCode = `B${String(index + 1).padStart(2, '0')}`;
    const row: Record<string, number> = Object.fromEntries(fields.map(field => [field, 0]));
    row['openingBalance'] = 90000000 + random(60000000);
    row['vaultOpening'] = 18000000 + random(12000000);
    const emit = (kind: BankingEvent['kind'], count: number) => {
      for (let position = 0; position < count; position++) {
        const hour = hourly[random(12)];
        const direction = random(100) < 52 ? 'in' : 'out';
        const amountCents = kind === 'transaction' ? 100 + random(249900) : kind === 'vault' ? 10000 + random(190000) : 0;
        const atm = kind === 'transaction' && position % 5 === 0;
        const effectiveDirection = atm ? 'out' : direction;
        if (kind === 'account' || kind === 'wallet') {
          const field = kind === 'account' ? 'accountsOpened' : 'walletsOpened';
          row[field]++; hour[field]++;
        } else if (kind === 'transaction') {
          row['transactions']++; hour.transactions++;
          const field = effectiveDirection === 'in' ? 'credits' : 'debits';
          row[field] += amountCents; hour[field] += amountCents;
          if (atm) { row['atmTransactions']++; row['atmAmount'] += amountCents; hour.atmTransactions++; hour.atmAmount += amountCents; }
        } else row[effectiveDirection === 'in' ? 'vaultCashIn' : 'vaultCashOut'] += amountCents;
        visit?.({ kind, businessDate, branchCode, hour: hour.hour, amountCents, direction: effectiveDirection, atm });
      }
    };
    emit('account', 500 + random(250));
    emit('wallet', 200 + random(160));
    emit('transaction', 1000 + random(500));
    emit('vault', 80);
    row['closingBalance'] = row['openingBalance'] + row['credits'] - row['debits'];
    row['vaultClosing'] = row['vaultOpening'] + row['vaultCashIn'] - row['vaultCashOut'];
    return { branchCode, branchName, branchLabel: `${branchCode} ${branchName}`, businessDate, ...row };
  });
  const totalsCents = Object.fromEntries(fields.map(field => [field, branchCents.reduce((sum, row) => sum + Number(row[field as keyof typeof row]), 0)]));
  const convert = (row: Record<string, unknown>): Record<string, unknown> => {
    const converted = { ...row };
    for (const field of moneyFields) if (typeof row[field] === 'number') converted[field] = Number(row[field]) / 100;
    for (const field of fields) if (typeof converted[field] === 'number') converted[`${field}Display`] = new Intl.NumberFormat('en-US', { minimumFractionDigits: moneyFields.includes(field) ? 2 : 0, maximumFractionDigits: 2 }).format(Number(converted[field]));
    return converted;
  };
  const totals = convert(totalsCents);
  const data: BankingSample = {
    BusinessDate: businessDate, Currency: 'USD', Synthetic: true,
    Methodology: 'SAMPLE: seeded synthetic events aggregated in integer USD cents; ATM withdrawals are a subset of customer debits. Vault movements are independent physical cash, not customer deposits. All events use the local business date; full-day simulation, not live activity.',
    Branches: branchCents.map(row => convert(row) as BankingBranch),
    Hours: hourly.map(row => convert(row)),
    Totals: Object.fromEntries(fields.map(field => [field, Number(totals[field])])),
    MinorUnitTotals: totalsCents,
    VaultMovements: 12 * 80,
    ReportRows: [],
  };
  for (const field of fields) data[`${field}Display`] = totals[`${field}Display`];
  return data;
}