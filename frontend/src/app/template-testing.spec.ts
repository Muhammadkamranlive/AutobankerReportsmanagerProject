import { vi } from 'vitest';
import { createTestData, rememberTestData, savedTestData, serverResponse } from './template-testing';
import { DesignerStore } from './designer.store';
import { makeObject } from './object-factory';

describe('saved-template test data', () => {
  it('preloads banking stats and supplies custom scalar, table and chart bindings', () => {
    const template = new DesignerStore().blankTemplate();
    template.objects = [makeObject('text', { text: '{{CustomName}} {{page}}' }),
      makeObject('table', { dataSource: 'CustomRows', columns: [{ id: 'value', field: 'amount', header: 'Amount', width: 90, align: 'left' }] }),
      makeObject('chart', { dataSource: 'Nested.ChartRows', labelField: 'category', series: [{ field: 'metric', label: 'Metric', color: '#123456' }] })];
    const data = createTestData(template);
    expect(data['Synthetic']).toBe(true);
    expect(data['Branches']).toHaveLength(12);
    expect(data['CustomName']).toBe('Sample CustomName 1');
    expect(data['page']).toBeUndefined();
    expect(data['CustomRows']).toEqual([{ amount: 100 }, { amount: 200 }, { amount: 300 }]);
    expect(data['Nested']).toEqual({ ChartRows: [{ category: 'Sample category 1', metric: 100 }, { category: 'Sample category 2', metric: 200 }, { category: 'Sample category 3', metric: 300 }] });
  });

  it('keeps supplied values unchanged and restores the exact frontend snapshot', () => {
    const template = new DesignerStore().blankTemplate();
    const supplied = { BusinessDate: '2026-01-02', Totals: { transactions: 57 }, ReportRows: [{ amount: 99 }] };
    const data = createTestData(template, supplied);
    expect(data).toMatchObject(supplied);
    expect(supplied).toEqual({ BusinessDate: '2026-01-02', Totals: { transactions: 57 }, ReportRows: [{ amount: 99 }] });
    rememberTestData('snapshot-test', data);
    expect(savedTestData({ id: 'snapshot-test', template, name: template.name, savedAtUtc: '' })).toEqual(data);
    localStorage.removeItem('report-test-data:snapshot-test');
  });

  it('reports server problems with useful error details', async () => {
    await expect(serverResponse(new Response(JSON.stringify({ title: 'Invalid template', detail: 'Name is required.' }), { status: 400 }))).rejects.toThrow('Name is required.');
    await expect(serverResponse(new Response('Storage unavailable', { status: 503 }))).rejects.toThrow('Storage unavailable');
  });

  it('keeps nested chart values and supplies invoice lines matching the sample total', () => {
    const template = new DesignerStore().blankTemplate();
    template.objects = [makeObject('chart', { dataSource: 'Nested.Rows', labelField: 'category', series: [{ field: 'metric', label: 'Metric', color: '#123456' }] })];
    const nested = { Rows: [{ category: 'Central', metric: 77 }] };
    const data = createTestData(template, { Nested: nested });
    expect(data['Nested']).toEqual(nested);
    const products = data['Products'] as { qty: number; price: number; total: number }[];
    expect(products.every(product => product.qty * product.price === product.total)).toBe(true);
    expect(products.reduce((sum, product) => sum + product.total, 0)).toBe(Number(String(data['Total']).replaceAll(',', '')));
  });

  it('does not make a successful server save fail when browser storage is full', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    try { expect(() => rememberTestData('test', {})).not.toThrow(); }
    finally { storage.mockRestore(); }
  });
});