import { TestBed } from '@angular/core/testing';
import { App } from '../app';
import { buildChartSvg, resolveData, resolveText } from '../chart-render';
import { parseTemplate } from '../template-import';
import { DASHBOARD_TEMPLATES } from './dashboards';
import { vi } from 'vitest';

describe('banking dashboard templates', () => {
  it('sends aggregate-only banking data and native chart objects to PDF preview', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App), app = fixture.componentInstance;
    app.chooseTemplate('Daily Branch Operations');
    const fetch = vi.fn().mockResolvedValue(new Response('pdf', { headers: { 'content-type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:dashboard-preview'), revokeObjectURL: vi.fn() });
    try {
      await app.previewPdf();
      const body = fetch.mock.calls[0][1].body as string;
      const payload = JSON.parse(body);
      expect(payload.data.Branches).toHaveLength(12);
      expect(payload.data.Hours).toHaveLength(12);
      expect(payload.data.Totals.transactions).toBeGreaterThanOrEqual(10000);
      expect(payload.template.objects.filter((item: { type: string }) => item.type === 'chart')).toHaveLength(2);
      expect(payload.data.Transactions).toBeUndefined();
      expect(body.length).toBeLessThan(60000);
      expect(app.previewError()).toBe('');
    } finally { app.closePreview(); fixture.destroy(); vi.unstubAllGlobals(); }
  });
  for (const definition of DASHBOARD_TEMPLATES) {
    it(`${definition.name} binds every object to compact samples inside landscape A4`, () => {
      const template = definition.build(), data = definition.sampleData!();
      expect(template.page).toMatchObject({ width: 842, height: 595, orientation: 'landscape' });
      expect(parseTemplate(JSON.parse(JSON.stringify(template)))).toEqual(template);
      const charts = template.objects.filter(item => item.type === 'chart');
      expect(charts).toHaveLength(2);
      for (const item of template.objects) {
        expect(item.x).toBeGreaterThanOrEqual(24);
        expect(item.x + item.width).toBeLessThanOrEqual(824);
        expect(item.y + item.height).toBeLessThanOrEqual(577);
        if (item.type === 'text') expect(resolveText(item.text, data)).not.toContain('{{');
        if (item.type === 'chart') expect(buildChartSvg(item, resolveData(data, item.dataSource))).not.toMatch(/No data|Invalid|exceed|NaN|Infinity/);
        if (item.type === 'table') {
          expect(item.headerHeight + 12 * item.rowHeight).toBe(item.height);
          for (const column of item.columns) for (const row of data['Branches'] as Record<string, unknown>[]) expect(row[column.field]).toBeDefined();
        }
      }
      expect(charts[0].x + charts[0].width).toBeLessThan(charts[1].x);
      expect(data['Synthetic']).toBe(true);
    });
  }
  it('loads fresh samples, preserves aggregates when applying ReportRows and resets ordinary templates', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App), app = fixture.componentInstance;
    const name = DASHBOARD_TEMPLATES[0].name;
    app.chooseTemplate(name);
    const first = app.reportData();
    app.applyReportData({ columns: [{ field: 'name', header: 'Name' }], rows: [{ name: 'Result' }], inputRows: 1 });
    expect(app.reportData()['Branches']).toBe(first['Branches']);
    expect(app.reportData()['ReportRows']).toEqual([{ name: 'Result' }]);
    app.chooseTemplate(name);
    expect(app.reportData()).not.toBe(first);
    expect(app.reportData()['Branches']).not.toBe(first['Branches']);
    app.chooseTemplate('Savings Account Statement');
    expect(app.reportData()).toEqual({ ReportRows: [] });
    app.chooseTemplate(name);
    app.newReport();
    expect(app.reportData()).toEqual({ ReportRows: [] });
    fixture.destroy();
  });
});