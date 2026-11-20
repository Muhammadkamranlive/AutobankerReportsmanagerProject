import { buildTable } from './table-render';
import { makeObject } from './object-factory';

describe('Imported table rendering', () => {
  it('uses bound rows without fabricated sample cells and supports placeholder sources', () => {
    const item = makeObject('table', { dataSource: '{{ReportRows}}', columns: [{ id: 'one', header: 'Branch', field: 'branch', width: 200, align: 'left' }] });
    if (item.type !== 'table') throw new Error('Expected table');
    const bound = buildTable(item, { ReportRows: [{ branch: 'Central' }] });
    expect(bound.getObjects().map(object => (object as unknown as { text?: string }).text)).toContain('Central');
    const empty = buildTable(item, { ReportRows: [] });
    expect(empty.getObjects().map(object => (object as unknown as { text?: string }).text)).not.toContain('Sample Item');
  });
  it('preserves the imported position and bounds despite long headers and oversized column widths', () => {
    const item = makeObject('table', {
      x: 40, y: 230, width: 510, height: 260,
      columns: [
        { id: 'one', header: 'A very long transaction description heading', field: 'product', width: 900, align: 'left' },
        { id: 'two', header: 'Balance', field: 'balance', width: 300, align: 'right' },
      ],
    });
    if (item.type !== 'table') throw new Error('Expected table');
    const table = buildTable(item);
    expect(table.getBoundingRect()).toEqual({ left: 40, top: 230, width: 510, height: 260 });
    expect(table.width + table.left).toBeLessThanOrEqual(595);
    expect(table.getObjects()[0].width).toBe(382.5);
    expect(Math.abs(table.getObjects()[0].getBoundingRect().left - 40)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(table.getObjects()[0].getBoundingRect().top - 230)).toBeLessThanOrEqual(0.5);
  });
});