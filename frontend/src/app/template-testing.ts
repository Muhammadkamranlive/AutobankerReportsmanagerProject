import { generateBankingSample } from './banking-sample';
import { STARTER_TEMPLATES } from './starterTemplates';
import { Template } from './types';

export interface SavedTemplateSummary { id: string; name: string; savedAtUtc: string; }
export interface SavedTemplate extends SavedTemplateSummary { template: Template; }
export interface TestFile { format: string; contentType: string; base64: string; }
export interface TestGeneration { templateId: string; name: string; generatedAtUtc: string; dataSha256: string; files: TestFile[]; }

export async function serverResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const text = await response.text();
  let message = text || `Server returned ${response.status}.`;
  try { const problem = JSON.parse(text); message = problem.detail || problem.title || message; } catch {}
  throw new Error(message);
}

export function createTestData(template: Template, existing: Record<string, unknown> = {}): Record<string, unknown> {
  const starter = STARTER_TEMPLATES.find(item => item.name === template.name);
  const banking = generateBankingSample();
  const data: Record<string, unknown> = {
    ...banking, CompanyName: 'Autobanker Demo Bank', CustomerName: 'Sample Customer',
    InvoiceNo: 'INV-TEST-001', Date: banking.BusinessDate, Total: '2,950.00',
    PaymentQR: 'https://example.com/invoice/INV-TEST-001',
    Products: [
      { product: 'Application development', qty: 1, price: 1200, total: 1200 },
      { product: 'Service setup', qty: 1, price: 850, total: 850 },
      { product: 'Dashboard design', qty: 2, price: 300, total: 600 },
      { product: 'Testing', qty: 5, price: 60, total: 300 },
    ],
    ...starter?.sampleData?.(), ...structuredClone(existing), Synthetic: true,
  };
  const sampleValue = (field: string, index: number): unknown =>
    /amount|balance|price|total|qty|quantity|count|debit|credit|opened|transactions|rate|percent/i.test(field)
      ? (index + 1) * 100 : `Sample ${field} ${index + 1}`;
  for (const item of template.objects) {
    if (item.type === 'text' || item.type === 'qrcode' || item.type === 'barcode') {
      const text = item.type === 'text' ? item.text : item.variable;
      for (const match of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
        const key = match[1];
        if (key !== 'page' && key !== 'pages' && data[key] === undefined) data[key] = sampleValue(key, 0);
      }
    }
    if (item.type !== 'table' && item.type !== 'chart') continue;
    const key = item.dataSource.replace(/\{\{|\}\}/g, '').trim();
    if (!key) continue;
    const fields = item.type === 'table' ? item.columns.map(column => column.field) : [item.labelField, ...item.series.map(series => series.field)];
    let rows = data[key];
    if (item.type === 'chart' && key.includes('.')) {
      rows = key.split('.').reduce<unknown>((parent, segment) => parent && typeof parent === 'object'
        ? (parent as Record<string, unknown>)[segment] : undefined, data);
    }
    if (!Array.isArray(rows) || !rows.length) rows = Array.from({ length: 3 }, () => ({}));
    const collection = (rows as Record<string, unknown>[]).map((row, index) => {
      const result = { ...row };
      for (const field of fields) if (result[field] === undefined)
        result[field] = item.type === 'chart' && field !== item.labelField ? (index + 1) * 100 : sampleValue(field, index);
      return result;
    });
    data[key] = collection;
    if (item.type === 'chart' && key.includes('.')) {
      const segments = key.split('.');
      let parent = data;
      for (const segment of segments.slice(0, -1)) {
        const value = parent[segment];
        parent[segment] = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        parent = parent[segment] as Record<string, unknown>;
      }
      parent[segments.at(-1)!] = collection;
    }
  }
  return data;
}

export function rememberTestData(id: string, data: Record<string, unknown>): void {
  try { localStorage.setItem(`report-test-data:${id}`, JSON.stringify(data)); } catch {}
}

export function savedTestData(saved: SavedTemplate): Record<string, unknown> {
  try {
    const stored = localStorage.getItem(`report-test-data:${saved.id}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return createTestData(saved.template);
}