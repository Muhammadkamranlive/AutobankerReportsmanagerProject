import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ReportDataBuilder } from './report-data-builder';
import { QueryResult } from './report-query';

const result: QueryResult = { columns: [{ field: 'Customer', header: 'Customer' }, { field: 'Balance', header: 'Balance' }], rows: [{ Customer: 'Sample Customer A', Balance: 2400 }], inputRows: 4 };
const response = (value: QueryResult = result) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json; charset=utf-8' } });

describe('ReportDataBuilder', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ReportDataBuilder] }));
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const create = () => TestBed.createComponent(ReportDataBuilder);

  it('renders functional controls and bounds preview to 100 rows', async () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const rows = Array.from({ length: 150 }, (_, index) => ({ Customer: `Sample ${index}`, Balance: index }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...result, rows })));
    await component.execute();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(fixture.nativeElement.textContent).toContain('150 rows');
    expect(fixture.nativeElement.textContent).toContain('Sample collections');
    expect(fixture.nativeElement.querySelector('dialog').getAttribute('aria-labelledby')).toBe('data-builder-title');
  });

  it('sends the backend schema with typed filter values and emits the full result', async () => {
    const component = create().componentInstance;
    component.addFilter();
    component.patchFilter(0, { field: 'Accounts.Balance' });
    component.patchFilter(0, { raw: '1000', operator: 'gte' });
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetch);
    const apply = vi.spyOn(component.applied, 'emit');
    await component.execute();
    expect(fetch).toHaveBeenCalledWith('/api/reports/query', expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }));
    const query = JSON.parse(fetch.mock.calls[0][1].body);
    expect(query.filters).toEqual([{ field: 'Accounts.Balance', operator: 'gte', value: 1000 }]);
    expect(query.select[0]).toEqual({ field: 'Customers.Name', alias: 'Customer', aggregate: 'none' });
    component.apply();
    expect(apply).toHaveBeenCalledWith(result);
    component.patchProjection(0, { alias: 'CustomerName' });
    expect(component.result()).toBeNull();
    expect(component.canUseResult()).toBe(false);
    component.apply();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('aborts on edit and ignores older responses even if a transport ignores abort', async () => {
    const component = create().componentInstance;
    let resolveOld!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(response({ ...result, rows: [] }));
    vi.stubGlobal('fetch', fetch);
    const pending = component.execute();
    expect(component.busy()).toBeTruthy();
    component.patchProjection(0, { alias: 'Customer' });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await component.execute();
    resolveOld(response());
    await pending;
    expect(component.result()?.rows).toEqual([]);
    expect(component.busy()).toBe('');
  });

  it('blocks invalid scalar values, invalid grouping and stale export requests', async () => {
    const component = create().componentInstance;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    component.addFilter();
    component.patchFilter(0, { mode: 'json', raw: '{}' });
    expect(component.validation()).toContain('scalar');
    await component.execute();
    await component.exportResult('csv');
    expect(fetch).not.toHaveBeenCalled();
    component.removeFilter(0);
    component.patchProjection(1, { aggregate: 'sum' });
    expect(component.validation()).toContain('Group');
    component.toggleGroup('Customers.Name', true);
    expect(component.validation()).toBe('');
  });

  it('reports problem details and rejects HTML masquerading as an export', async () => {
    const component = create().componentInstance;
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Join exceeds row limit.' }), { status: 400, headers: { 'content-type': 'application/problem+json' } })).mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    await component.execute();
    expect(component.error()).toBe('Join exceeds row limit.');
    expect(component.result()).toBeNull();
    await component.execute();
    await component.exportResult('pdf');
    expect(component.error()).toContain('Expected PDF');
    expect(component.busy()).toBe('');
  });

  it('exports each artifact with the current query, MIME checks and a filename', async () => {
    const component = create().componentInstance;
    const fetch = vi.fn().mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const download = vi.spyOn(component as any, 'download').mockImplementation(() => {});
    await component.execute();
    for (const [format, mime, endpoint, filename] of [
      ['pdf', 'application/pdf', '/api/reports/query/pdf', 'result.pdf'],
      ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '/api/reports/export/xlsx', 'result.xlsx'],
      ['csv', 'text/csv', '/api/reports/export/csv', 'result.csv'],
      ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '/api/reports/export/docx', 'report.docx'],
      ['all', 'application/zip', '/api/reports/export/all', 'report-123.zip'],
    ] as const) {
      fetch.mockResolvedValueOnce(new Response('artifact', { headers: { 'content-type': mime, 'content-disposition': `attachment; filename="${filename}"` } }));
      await component.exportResult(format);
      expect(fetch).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({ headers: { 'Content-Type': 'application/json', Accept: mime }, body: JSON.stringify(component.payload()) }));
      expect(download).toHaveBeenLastCalledWith(expect.objectContaining({ size: 8, type: mime }), filename);
    }
  });

  it.each([
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 'Word'],
    ['all', 'application/zip', 'zip', 'ZIP All formats'],
  ] as const)('validates %s responses and uses the correct fallback extension', async (format, mime, extension, label) => {
    const component = create().componentInstance;
    const fetch = vi.fn().mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const download = vi.spyOn(component as any, 'download').mockImplementation(() => {});
    await component.execute();
    for (const wrongMime of ['text/html', 'application/json', 'application/pdf']) {
      fetch.mockResolvedValueOnce(new Response('wrong artifact', { headers: { 'content-type': wrongMime } }));
      await component.exportResult(format);
      expect(component.error()).toContain(`Expected ${label}`);
      expect(download).not.toHaveBeenCalled();
      expect(component.busy()).toBe('');
    }
    fetch.mockResolvedValueOnce(new Response('', { headers: { 'content-type': mime } }));
    await component.exportResult(format);
    expect(component.error()).toContain('empty');
    expect(download).not.toHaveBeenCalled();
    for (const disposition of ['', 'attachment; filename="wrong.html"', 'attachment; filename="report.all"']) {
      fetch.mockResolvedValueOnce(new Response('artifact', { headers: { 'content-type': mime, 'content-disposition': disposition } }));
      await component.exportResult(format);
      expect(download).toHaveBeenLastCalledWith(expect.objectContaining({ type: mime }), `report-results.${extension}`);
      expect(component.error()).toBe('');
    }
  });

  it.each(['docx', 'all'] as const)('blocks stale %s requests and ignores responses after an edit', async format => {
    const component = create().componentInstance;
    let resolveExport!: (response: Response) => void;
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveExport = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const download = vi.spyOn(component as any, 'download').mockImplementation(() => {});
    await component.exportResult(format);
    expect(fetch).not.toHaveBeenCalled();
    await component.execute();
    const pending = component.exportResult(format);
    component.patchProjection(0, { alias: 'RenamedCustomer' });
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    const mime = component.artifacts.find(artifact => artifact.format === format)!.mime;
    resolveExport(new Response('artifact', { headers: { 'content-type': mime } }));
    await pending;
    await component.exportResult(format);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(download).not.toHaveBeenCalled();
    expect(component.result()).toBeNull();
    expect(component.error()).toBe('');
    expect(component.busy()).toBe('');
  });

  it('renders Word and ZIP controls and limits paginated exports to 12 columns', async () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    while (component.query().select.length < 12) component.addProjection('Customers.Name');
    const queryResult = (): QueryResult => ({ ...result, columns: component.query().select.map(column => ({ field: column.alias, header: column.alias })) });
    fetch.mockResolvedValueOnce(response(queryResult()));
    await component.execute();
    for (const format of ['pdf', 'docx', 'all'] as const) expect(component.canExport(format)).toBe(true);
    component.addProjection('Customers.Name');
    fetch.mockResolvedValueOnce(response(queryResult()));
    await component.execute();
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.footer-actions button')) as HTMLButtonElement[];
    const button = (label: string) => buttons.find(button => button.textContent?.trim() === label)!;
    expect(buttons.some(button => button.textContent?.trim() === 'DOCX')).toBe(false);
    for (const label of ['PDF', 'Word', 'ZIP All formats']) {
      expect(button(label).disabled).toBe(true);
      expect(button(label).title).toContain('at most 12 output columns');
    }
    for (const label of ['XLSX', 'CSV', 'Apply to report']) expect(button(label).disabled).toBe(false);
    for (const format of ['pdf', 'docx', 'all'] as const) await component.exportResult(format);
    expect(fetch).toHaveBeenCalledTimes(2);
    component.removeProjection(12);
    fetch.mockResolvedValueOnce(response(queryResult()));
    await component.execute();
    fixture.detectChanges();
    for (const label of ['PDF', 'Word', 'ZIP All formats']) {
      expect(button(label).disabled).toBe(false);
      expect(button(label).title).not.toContain('at most 12');
    }
  });

  it('renames references, updates sorted aliases and removes dependent source fields', () => {
    const component = create().componentInstance;
    component.addSort();
    component.renameSource('Customers', 'People');
    expect(component.query().from).toBe('People');
    expect(component.query().joins[0].left).toBe('People.Id');
    expect(component.query().select[0].field).toBe('People.Name');
    component.patchProjection(0, { alias: 'Name' });
    expect(component.query().sort[0].field).toBe('Name');
    component.removeSource(1);
    expect(component.query().joins).toEqual([]);
    expect(component.query().select).toHaveLength(1);
    expect(component.validation()).toBe('');
  });

  it('imports named collections and a saved query, preserving the prior query on invalid uploads', async () => {
    const component = create().componentInstance;
    const upload = (text: string) => ({ target: { files: [{ size: text.length, text: async () => text }], value: 'data.json' } }) as unknown as Event;
    await component.importFile(upload('{"Branches":[{"Id":1,"Name":"Sample branch"}]}'));
    expect(component.query().sources.at(-1)?.alias).toBe('Branches');
    const query = JSON.stringify(component.payload());
    await component.importFile(upload('{"invalid-field":[{"Id":1}]}'));
    expect(component.error()).toContain('Invalid source alias');
    expect(JSON.stringify(component.payload())).toBe(query);
    await component.importFile(upload(query), true);
    expect(JSON.stringify(component.payload())).toBe(query);
    expect(component.error()).toBe('');
  });

  it('cancels requests on close and destruction', async () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetch);
    const closed = vi.spyOn(component.closed, 'emit');
    const pending = component.execute();
    component.close();
    await pending;
    expect(closed).toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(component.result()).toBeNull();
    fixture.destroy();
  });

  it('closes on dialog Escape without propagating a designer shortcut', () => {
    const fixture = create();
    fixture.detectChanges();
    const closed = vi.spyOn(fixture.componentInstance.closed, 'emit');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('dialog').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledOnce();
  });
});