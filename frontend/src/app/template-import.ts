import { makeObject } from './object-factory';
import { makePage, ObjectType, Template, TemplateObject } from './types';
import { validateChart } from './chart-render';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a report template object.');
  return value as Record<string, unknown>;
}

function dimension(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
  return value;
}

export function parseTemplate(value: unknown): Template {
  const envelope = record(value);
  const source = envelope['template'] === undefined ? envelope : record(envelope['template']);
  if (!Array.isArray(source['objects'])) throw new Error('This file does not contain a report objects array.');
  const inputPage = record(source['page']);
  const page = { ...makePage(), ...inputPage } as Template['page'];
  page.width = dimension(inputPage['width'], 595, 'Page width');
  page.height = dimension(inputPage['height'], 842, 'Page height');
  page.margins = { ...makePage().margins, ...record(inputPage['margins'] ?? {}) };
  const supported: ObjectType[] = ['text', 'rect', 'circle', 'line', 'image', 'qrcode', 'barcode', 'table', 'chart'];
  const ids = new Set<string>();
  const objects = source['objects'].map((value, index): TemplateObject => {
    const raw = record(value);
    const type = raw['type'] as ObjectType;
    if (!supported.includes(type)) throw new Error(`Object ${index + 1} has an unsupported type: ${String(raw['type'])}.`);
    const item = makeObject(type, raw);
    item.width = dimension(raw['width'], item.width, `Object ${index + 1} width`);
    item.height = dimension(raw['height'], item.height, `Object ${index + 1} height`);
    if (![item.x, item.y, item.rotation].every((number) => typeof number === 'number' && Number.isFinite(number))) throw new Error(`Object ${index + 1} has invalid coordinates.`);
    if (typeof item.id !== 'string' || ids.has(item.id)) throw new Error(`Object ${index + 1} has an invalid or duplicate ID.`);
    ids.add(item.id);
    if (item.type === 'image' && typeof item.src !== 'string') throw new Error(`Image ${index + 1} has an invalid source.`);
    if (item.type === 'text' && typeof item.text !== 'string') throw new Error(`Text object ${index + 1} has invalid text.`);
    if (item.type === 'chart') {
      for (const field of ['chartType', 'title', 'dataSource', 'labelField', 'series']) {
        if (!Object.hasOwn(raw, field)) throw new Error(`Chart ${index + 1} is missing ${field}.`);
      }
      validateChart(item);
    }
    if (item.type === 'table') {
      if (!Array.isArray(item.columns)) throw new Error(`Table ${index + 1} has invalid columns.`);
      item.columns = item.columns.map((value, columnIndex) => {
        const column = record(value);
        return {
          id: typeof column['id'] === 'string' ? column['id'] : `${item.id}-${columnIndex}`,
          header: String(column['header'] ?? ''), field: String(column['field'] ?? ''),
          width: dimension(column['width'], 80, 'Column width'),
          align: column['align'] === 'center' || column['align'] === 'right' ? column['align'] : 'left',
        };
      });
      item.headerHeight = dimension(item.headerHeight, 30, 'Table header height');
      item.rowHeight = dimension(item.rowHeight, 26, 'Table row height');
      item.fontSize = dimension(item.fontSize, 12, 'Table font size');
    }
    return item;
  });
  return {
    version: typeof source['version'] === 'string' ? source['version'] : '1.0',
    name: typeof source['name'] === 'string' ? source['name'] : 'Imported Template',
    page, objects,
    watermark: { enabled: false, text: 'DRAFT', color: '#cc0000', opacity: 0.15, fontSize: 96, rotation: -35, ...record(source['watermark'] ?? {}) },
    pagination: { enabled: false, format: 'Page {{page}} of {{pages}}', align: 'center', ...record(source['pagination'] ?? {}) },
  };
}