import { generateBankingSample } from '../banking-sample';
import { makeObject } from '../object-factory';
import { ChartObjectProps, Template, TemplateObject, makePage } from '../types';
import type { StarterTemplateDef } from './library';

const colors = ['#16845b', '#087f8c', '#d86450', '#367ac4', '#a67c0b'];
interface DashboardSpec {
  name: string; id: string; description: string;
  kpis: [string, string][];
  charts: { title: string; fields: [string, string][]; type?: ChartObjectProps['chartType']; source?: string }[];
  columns: [string, string, number][];
  note: string;
}
const specs: DashboardSpec[] = [
  {
    id: 'daily-branch-operations', name: 'Daily Branch Operations', description: 'Today across 12 branches: openings, activity, customer balances and physical cash.',
    kpis: [['Accounts opened', 'accountsOpened'], ['Wallets opened', 'walletsOpened'], ['Transactions', 'transactions'], ['ATM withdrawals', 'atmTransactions'], ['Vault close / USD', 'vaultClosing']],
    charts: [{ title: 'Today / accounts and wallets opened', fields: [['accountsOpened', 'Accounts'], ['walletsOpened', 'Wallets']] }, { title: 'Today / transactions by branch', fields: [['transactions', 'Transactions']], type: 'line' }],
    columns: [['Branch', 'branchName', 158], ['Accounts', 'accountsOpenedDisplay', 74], ['Wallets', 'walletsOpenedDisplay', 74], ['Txns', 'transactionsDisplay', 75], ['Deposit open / USD', 'openingBalanceDisplay', 130], ['Deposit close / USD', 'closingBalanceDisplay', 130], ['Vault close / USD', 'vaultClosingDisplay', 153]],
    note: 'Customer deposits and physical vault cash are separate balances. Branch codes B01-B12 follow table order.',
  },
  {
    id: 'accounts-wallet-openings', name: 'Accounts and Wallet Openings', description: 'Synthetic full-day opening volumes by branch and local hour.',
    kpis: [['Accounts opened', 'accountsOpened'], ['Wallets opened', 'walletsOpened'], ['Branches', 'BranchCount'], ['Business date', 'BusinessDate'], ['Currency', 'Currency']],
    charts: [{ title: 'Today / openings by branch', fields: [['accountsOpened', 'Accounts'], ['walletsOpened', 'Wallets']] }, { title: 'Today / openings by local hour', source: 'Hours', type: 'line', fields: [['accountsOpened', 'Accounts'], ['walletsOpened', 'Wallets']] }],
    columns: [['Code', 'branchCode', 70], ['Branch', 'branchName', 270], ['Business date', 'businessDate', 170], ['Accounts opened', 'accountsOpenedDisplay', 192], ['Wallets opened', 'walletsOpenedDisplay', 192]],
    note: 'Counts derive from individual seeded opening events. Hourly view covers 08:00-19:00 local business time.',
  },
  {
    id: 'daily-transactions-balances', name: 'Daily Transactions & Balances', description: 'Customer deposit debits, credits and reconciled opening/closing balances in USD.',
    kpis: [['Transactions', 'transactions'], ['Opening / USD', 'openingBalance'], ['Credits / USD', 'credits'], ['Debits / USD', 'debits'], ['Closing / USD', 'closingBalance']],
    charts: [{ title: 'Customer deposit movement / USD', fields: [['credits', 'Credits'], ['debits', 'Debits']] }, { title: 'Opening and closing customer deposits / USD', type: 'line', fields: [['openingBalance', 'Opening'], ['closingBalance', 'Closing']] }],
    columns: [['Branch', 'branchName', 164], ['Txns', 'transactionsDisplay', 70], ['Opening / USD', 'openingBalanceDisplay', 132], ['Credits / USD', 'creditsDisplay', 132], ['Debits / USD', 'debitsDisplay', 132], ['Closing / USD', 'closingBalanceDisplay', 164]],
    note: 'Customer deposit closing = opening + credits - debits. ATM withdrawals are included in customer debits.',
  },
  {
    id: 'atm-activity', name: 'ATM Activity', description: 'ATM withdrawal counts, USD amounts and branch share, included within customer transactions.',
    kpis: [['ATM withdrawals', 'atmTransactions'], ['Withdrawn / USD', 'atmAmount'], ['All transactions', 'transactions'], ['Branches', 'BranchCount'], ['Business date', 'BusinessDate']],
    charts: [{ title: 'ATM withdrawals by branch / count', fields: [['atmTransactions', 'Withdrawals']] }, { title: 'Branch share of ATM amount / USD', type: 'donut', fields: [['atmAmount', 'Withdrawn USD']] }],
    columns: [['Code', 'branchCode', 70], ['Branch', 'branchName', 230], ['ATM withdrawals', 'atmTransactionsDisplay', 150], ['ATM amount / USD', 'atmAmountDisplay', 194], ['All transactions', 'transactionsDisplay', 150], ['Customer debits / USD', 'debitsDisplay', 200]],
    note: 'ATM records are synthetic withdrawals, a subset of transactions and debits, not additional transaction volume.',
  },
  {
    id: 'vault-cash-position', name: 'Vault Cash Position', description: 'Independent physical cash opening, cash-in, cash-out and reconciled closing positions.',
    kpis: [['Vault open / USD', 'vaultOpening'], ['Cash in / USD', 'vaultCashIn'], ['Cash out / USD', 'vaultCashOut'], ['Vault close / USD', 'vaultClosing'], ['Cash movements', 'VaultMovements']],
    charts: [{ title: 'Vault physical cash movement / USD', fields: [['vaultCashIn', 'Cash in'], ['vaultCashOut', 'Cash out']] }, { title: 'Vault opening and closing / USD', type: 'line', fields: [['vaultOpening', 'Opening'], ['vaultClosing', 'Closing']] }],
    columns: [['Code', 'branchCode', 65], ['Branch', 'branchName', 185], ['Opening / USD', 'vaultOpeningDisplay', 136], ['Cash in / USD', 'vaultCashInDisplay', 136], ['Cash out / USD', 'vaultCashOutDisplay', 136], ['Closing / USD', 'vaultClosingDisplay', 136]],
    note: 'Vault closing = opening + cash in - cash out. Physical cash is independent of customer deposit ledger balances.',
  },
];

function buildDashboard(spec: DashboardSpec): Template {
  const objects: TemplateObject[] = [];
  const label = (text: string, x: number, y: number, width: number, height: number, fontSize = 9, color = '#36443f', bold = false) => objects.push(makeObject('text', { name: text, text, x, y, width, height, fontSize, color, fontWeight: bold ? 'bold' : 'normal' }));
  label(spec.name, 24, 27, 650, 28, 22, '#203b30', true);
  label('SAMPLE / SYNTHETIC', 670, 31, 148, 16, 10, '#b14d3c', true);
  label('LOCAL BUSINESS DATE {{BusinessDate}}   |   USD   |   12 BRANCHES   |   FULL-DAY SIMULATION', 24, 60, 794, 16, 9);
  spec.kpis.forEach(([title, field], index) => {
    const x = 24 + index * 160;
    objects.push(makeObject('rect', { name: `${title} band`, x, y: 87, width: 154, height: 55, fill: colors[index], strokeWidth: 0 }));
    label(title, x + 9, 94, 136, 12, 9, '#ffffff');
    const binding = ['BranchCount', 'BusinessDate', 'Currency', 'VaultMovements'].includes(field) ? field : `${field}Display`;
    label(`{{${binding}}}`, x + 9, 111, 136, 23, field === 'BusinessDate' ? 16 : 17, '#ffffff', true);
  });
  spec.charts.forEach((chart, index) => {
    objects.push(makeObject('chart', { name: chart.title, title: chart.title, x: 24 + index * 403, y: 153, width: 391, height: 184, chartType: chart.type ?? 'bar', dataSource: chart.source ?? 'Branches', labelField: chart.source === 'Hours' ? 'hour' : 'branchCode', series: chart.fields.map(([field, seriesLabel], position) => ({ field, label: seriesLabel, color: colors[position === 0 ? index : 2] })) }));
  });
  const total = spec.columns.reduce((sum, column) => sum + column[2], 0);
  objects.push(makeObject('table', { name: 'All 12 branches', x: 24, y: 351, width: 794, height: 184, headerHeight: 22, rowHeight: 13.5, fontSize: 8, headerBg: '#e9f1ed', headerColor: '#203b30', borderColor: '#d9e3dd', dataSource: 'Branches', columns: spec.columns.map(([header, field, width], index) => ({ id: field, header, field: field === 'branchName' ? 'branchLabel' : field, width: width / total * 794, align: index === 0 || field === 'branchName' || field === 'businessDate' ? 'left' : 'right' })) }));
  label(spec.note, 24, 545, 794, 13, 8);
  label('SAMPLE - Seeded synthetic events; integer USD cents aggregated before display. Not live bank data.', 24, 563, 794, 13, 8, '#b14d3c');
  return { version: '1.0', name: spec.name, page: { ...makePage('A4', 'landscape'), margins: { top: 24, right: 24, bottom: 18, left: 24 } }, objects, watermark: { enabled: false, text: 'SAMPLE', color: '#b14d3c', opacity: .1, fontSize: 80, rotation: -25 }, pagination: { enabled: false, format: 'Page {{page}} of {{pages}}', align: 'right' } };
}

export const DASHBOARD_TEMPLATES: StarterTemplateDef[] = specs.map(spec => ({ id: spec.id, name: spec.name, description: spec.description, category: 'Banking Dashboards', build: () => buildDashboard(spec), sampleData: () => ({ ...generateBankingSample(), BranchCount: 12 }) }));