import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { App } from './app';
import * as fabric from 'fabric';
import { vi } from 'vitest';
import { makeObject } from './object-factory';

describe('App', () => {
  it('saves to the server and updates the same saved template on subsequent saves', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const saved = { id: 'server-id', name: app.template().name, template: app.template(), savedAtUtc: '2026-10-29T00:00:00Z' };
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(saved)));
    vi.stubGlobal('fetch', fetch);
    try {
      await app.save();
      expect(fetch.mock.calls[0][0]).toBe('/api/templates');
      expect(fetch.mock.calls[0][1].method).toBe('POST');
      expect(app.serverTemplateId()).toBe('server-id');
      expect(app.saveStatus()).toContain('Saved to server');
      await app.save();
      expect(fetch.mock.calls[1][0]).toBe('/api/templates/server-id');
      expect(fetch.mock.calls[1][1].method).toBe('PUT');
      app.newReport();
      expect(app.serverTemplateId()).toBe('');
    } finally { localStorage.removeItem('report-test-data:server-id'); vi.unstubAllGlobals(); fixture.destroy(); }
  });

  it('surfaces server save errors without claiming a template was saved', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Template storage is unavailable.' }), { status: 503 })));
    try {
      await app.save();
      expect(app.saveError()).toBe('Template storage is unavailable.');
      expect(app.saveStatus()).toBe('');
      expect(app.serverTemplateId()).toBe('');
      expect(app.saving()).toBe(false);
    } finally { vi.unstubAllGlobals(); fixture.destroy(); }
  });

  it('rebuilds the canvas on bound scalar changes without mutating template strings', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.canvasElement = new ElementRef(document.createElement('canvas'));
    app.ngAfterViewInit();
    const text = makeObject('text', { text: '{{BusinessDate}}' });
    app.store.add(text);
    app.reportData.set({ BusinessDate: '2026-10-28' });
    fixture.detectChanges();
    await vi.waitFor(() => expect((app['canvas']?.getObjects()[0] as fabric.Textbox)?.text).toBe('2026-10-28'));
    app.reportData.set({ BusinessDate: '2026-10-29' });
    fixture.detectChanges();
    await vi.waitFor(() => expect((app['canvas']?.getObjects()[0] as fabric.Textbox)?.text).toBe('2026-10-29'));
    expect(text.type === 'text' && text.text).toBe('{{BusinessDate}}');
    fixture.destroy();
  });

  it('builds charts from bound data using embedded SVG and edits series with donut constraints', async () => {
    const fixture = TestBed.createComponent(App), app = fixture.componentInstance;
    app.add('chart');
    app.addChartSeries();
    app.updateChartSeries(1, { field: 'transactions', label: 'Transactions', color: '#123456' });
    expect(app.selected()).toMatchObject({ series: [{ field: 'accountsOpened' }, { field: 'transactions' }] });
    app.removeChartSeries(1);
    app.setChartType('donut');
    app.addChartSeries();
    const selected = app.selected();
    expect(selected?.type === 'chart' && selected.series).toHaveLength(1);
    app.reportData.set({ Branches: [{ branchCode: 'B01', accountsOpened: 20 }] });
    const fromURL = vi.spyOn(fabric.FabricImage, 'fromURL').mockResolvedValue(new fabric.FabricImage(document.createElement('canvas')));
    try {
      await app['buildFabricObject'](app.selected()!);
      const source = fromURL.mock.calls[0][0];
      expect(source).toContain('data:image/svg+xml;base64,');
      expect(atob(source.split(',')[1])).toContain('stroke-dasharray');
    } finally { fromURL.mockRestore(); fixture.destroy(); }
  });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    expect(app.template().page.size).toBe('A4');
    expect(app.tools).toHaveLength(9);
    expect(app.templates).toHaveLength(30);
  });

  it('should insert a variable as editable text', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.insertVariable('{{CustomerName}}');
    expect(app.template().objects).toHaveLength(1);
    const item = app.template().objects[0];
    expect(item.type).toBe('text');
    expect(item.type === 'text' ? item.text : '').toBe('{{CustomerName}}');
  });

  it('applies dataset columns to a new body table and then rebinds the selected table', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const result = { columns: [{ field: 'Balance', header: 'Balance' }], rows: [{ Balance: 120 }], inputRows: 1 };
    app.showDataBuilder.set(true);
    app.applyReportData(result);
    const table = app.selected();
    expect(table).toMatchObject({ type: 'table', region: 'body', dataSource: 'ReportRows', x: app.template().page.margins.left });
    expect(table?.type === 'table' && table.columns[0]).toMatchObject({ field: 'Balance', header: 'Balance', align: 'left' });
    expect(app.reportData()).toEqual({ ReportRows: [{ Balance: 120 }] });
    expect(app.showDataBuilder()).toBe(false);
    app.applyReportData({ ...result, rows: [] });
    expect(app.template().objects).toHaveLength(1);
    expect(app.selected()?.id).toBe(table?.id);
    expect(app.reportData()).toEqual({ ReportRows: [] });
  });

  it('sends applied report rows to PDF preview and suppresses designer shortcuts while the dialog is open', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    const result = { columns: [{ field: 'Name', header: 'Name' }], rows: [{ Name: 'Sample' }], inputRows: 1 };
    app.applyReportData(result);
    const table = app.selected();
    app.showDataBuilder.set(true);
    app['onKeydown'](new KeyboardEvent('keydown', { key: 'Delete' }));
    app['onKeydown'](new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(app.selected()).toBe(table);
    const fetch = vi.fn().mockResolvedValue(new Response('pdf', { headers: { 'content-type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:preview'), revokeObjectURL: vi.fn() });
    try {
      await app.previewPdf();
      expect(JSON.parse(fetch.mock.calls[0][1].body).data).toEqual({ ReportRows: result.rows });
      expect(app.previewError()).toBe('');
    } finally { app.closePreview(); vi.unstubAllGlobals(); }
  });

  it('keeps the existing report when an imported file is invalid', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const original = app.template();
    const input = { files: [{ text: async () => '{"objects":{}}' }], value: 'invalid.json' };
    await app.importJson({ target: input } as unknown as Event);
    expect(app.template()).toBe(original);
    expect(app.importError()).toContain('objects array');
    expect(input.value).toBe('');
  });

  it('renders the remaining objects and a named placeholder when a logo fails', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const canvas = new fabric.Canvas(document.createElement('canvas'));
    app['canvas'] = canvas;
    const image = makeObject('image', { name: 'Bank logo', src: 'missing-logo.png' });
    const text = makeObject('text', { text: 'Account statement' });
    const loadImage = vi.spyOn(fabric.FabricImage, 'fromURL').mockRejectedValue(new Error('Image unavailable'));
    try {
      await app['renderObjects']([image, text], 595, 842, 1);
      expect(canvas.getObjects()).toHaveLength(2);
      expect(app.renderWarnings()[0]).toContain('Bank logo');
      expect(canvas.getObjects()[1]).toBeInstanceOf(fabric.Textbox);
      expect(image.type === 'image' && image.src).toBe('missing-logo.png');
    } finally {
      loadImage.mockRestore();
      fixture.destroy();
    }
  });

  it('keeps an object selected after changing its position and rebuilding the canvas', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.canvasElement = new ElementRef(document.createElement('canvas'));
    app.ngAfterViewInit();
    const item = makeObject('rect', { x: 60, y: 60 });
    app.store.add(item);
    await app['renderObjects'](app.template().objects, 595, 842, 0.82);
    app.select(item.id);
    app.patch({ x: 120, y: 100 }, true);
    await app['renderObjects'](app.template().objects, 595, 842, 0.82);
    expect(app.store.selectedId()).toBe(item.id);
    expect(app.selected()?.x).toBe(120);
    expect(app['canvas']?.getActiveObject()?.left).toBe(120);
    expect(app['canvas']?.getActiveObject()?.top).toBe(100);
    fixture.destroy();
  });

  it('inserts a dropped tool using page coordinates at the current zoom', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200 } as DOMRect);
    app.pageElement = new ElementRef(element);
    app.store.zoom.set(0.5);
    app.onDrop({ preventDefault() {}, stopPropagation() {}, clientX: 200, clientY: 350, dataTransfer: { files: [], getData: () => JSON.stringify({ type: 'rect' }) } } as unknown as DragEvent);
    expect(app.template().objects).toHaveLength(1);
    expect(app.selected()).toMatchObject({ type: 'rect', x: 200, y: 300 });
    app.store.undo();
    expect(app.template().objects).toHaveLength(0);
    fixture.destroy();
  });

  it('accepts a workspace drop outside the paper without placing the object off-page', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200 } as DOMRect);
    app.pageElement = new ElementRef(element);
    app.onDrop({ preventDefault() {}, stopPropagation() {}, clientX: 50, clientY: 150, dataTransfer: { files: [], getData: () => JSON.stringify({ type: 'variable', value: '{{CustomerName}}' }) } } as unknown as DragEvent);
    expect(app.selected()).toMatchObject({ type: 'text', text: '{{CustomerName}}', x: 0, y: 0 });
    fixture.destroy();
  });

  it('keeps the image-tool drop position after the image file is selected', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.add('image', 180, 280);
    const file = new File(['image contents'], 'logo.png', { type: 'image/png' });
    app.onImage({ target: { files: [file], value: 'logo.png' } } as unknown as Event);
    await vi.waitFor(() => expect(app.selected()).toMatchObject({ type: 'image', x: 180, y: 280 }));
    fixture.destroy();
  });
});
