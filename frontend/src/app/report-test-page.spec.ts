import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ReportTestPage } from './report-test-page';
import { DesignerStore } from './designer.store';

describe('ReportTestPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads server templates with frontend data and generates all downloads in one request', async () => {
    const template = new DesignerStore().blankTemplate();
    const saved = { id: 'test-id', name: template.name, savedAtUtc: '2026-10-29T00:00:00Z', template };
    const generated = { templateId: saved.id, name: saved.name, dataSha256: 'abc', generatedAtUtc: saved.savedAtUtc,
      files: ['pdf', 'csv', 'xlsx', 'docx', 'zip'].map(format => ({ format, contentType: 'application/octet-stream', base64: btoa('test artifact') })) };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([saved])).mockResolvedValueOnce(Response.json(saved)).mockResolvedValueOnce(Response.json(generated)).mockResolvedValueOnce(Response.json(saved));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL });
    const fixture = TestBed.createComponent(ReportTestPage);
    const page = fixture.componentInstance;
    await page.refresh();
    expect(page.selectedId()).toBe(saved.id);
    expect(page.sampleData()['Synthetic']).toBe(true);
    const snapshot = structuredClone(page.sampleData());
    await page.generate();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toBe('/api/templates/test-id/generate');
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(snapshot);
    expect(page.result()?.files).toHaveLength(5);
    expect(page.previewUrl()).toBe('blob:test');
    await page.select(saved.id);
    expect(page.result()).toBeNull();
    expect(page.previewUrl()).toBe('');
    expect(page.error()).toBe('');
    expect(revokeObjectURL).toHaveBeenCalledTimes(5);
    fixture.destroy();
  });

  it('displays generation failures and always clears busy state', async () => {
    const fixture = TestBed.createComponent(ReportTestPage);
    const page = fixture.componentInstance;
    page.selected.set({ id: 'missing', name: 'Report', savedAtUtc: '', template: new DesignerStore().blankTemplate() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Template was not found.', { status: 404 })));
    await page.generate();
    expect(page.error()).toBe('Template was not found.');
    expect(page.busy()).toBe(false);
    expect(page.result()).toBeNull();
    fixture.destroy();
  });
});