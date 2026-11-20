import { parseTemplate } from './template-import';
import { DesignerStore } from './designer.store';
import { makeObject } from './object-factory';

describe('Template import', () => {
  it('round trips native charts and rejects missing or invalid chart schema', () => {
    const original = { ...new DesignerStore().blankTemplate(), objects: [makeObject('chart')] };
    expect(parseTemplate(JSON.parse(JSON.stringify(original)))).toEqual(original);
    for (const patch of [{ chartType: 'pie' }, { series: [] }, { series: [{ field: 'x', label: 'X', color: 'red' }] }, { title: 'X'.repeat(81) }]) {
      expect(() => parseTemplate({ ...original, objects: [{ ...original.objects[0], ...patch }] })).toThrow();
    }
    const missing = { ...original.objects[0] } as Record<string, unknown>;
    delete missing['series'];
    expect(() => parseTemplate({ ...original, objects: [missing] })).toThrow('missing series');
  });
  const template = () => ({ ...new DesignerStore().blankTemplate('Imported report'), objects: [makeObject('image', { src: 'data:image/png;base64,abc', x: 36, y: 26 }), makeObject('table', { x: 36, y: 230, width: 523, height: 400 })] });

  it('preserves embedded logos, page settings and table geometry on round trip', () => {
    const original = template();
    expect(parseTemplate(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('accepts a saved-template wrapper', () => {
    const original = template();
    expect(parseTemplate({ meta: { id: 'report' }, template: original })).toEqual(original);
  });

  it('fills missing optional settings for older reports', () => {
    const original = template();
    const parsed = parseTemplate({ name: original.name, page: original.page, objects: original.objects });
    expect(parsed.watermark.enabled).toBe(false);
    expect(parsed.pagination.enabled).toBe(false);
  });

  it('rejects invalid coordinates before replacing the current report', () => {
    const original = template();
    original.objects[0].x = Number.NaN;
    expect(() => parseTemplate(original)).toThrow('invalid coordinates');
  });

  it('rejects unsupported files and invalid table dimensions', () => {
    expect(() => parseTemplate({ objects: {} })).toThrow('objects array');
    const original = template();
    original.objects[1].width = -100;
    expect(() => parseTemplate(original)).toThrow('width must be a positive number');
  });
});