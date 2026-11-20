import { nanoid } from 'nanoid';
import { PageConfig, TemplateObject, ObjectType } from './types';

export function makeObject(type: ObjectType, overrides: Record<string, unknown> = {}): TemplateObject {
  const base = { id: nanoid(8), type, name: type[0].toUpperCase() + type.slice(1), x: 60, y: 60, width: 160, height: 40, rotation: 0, locked: false, hidden: false, region: 'body' as const };
  const defaults: Record<ObjectType, Record<string, unknown>> = {
    chart: { width: 460, height: 240, chartType: 'bar', title: 'Branch activity', dataSource: 'Branches', labelField: 'branchCode', series: [{ field: 'accountsOpened', label: 'Accounts', color: '#16845b' }] },
    text: { width: 200, height: 30, text: 'Text', fontFamily: 'Helvetica', fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false, color: '#1a1a1a', backgroundColor: null, align: 'left', letterSpacing: 0 },
    rect: { width: 160, height: 90, name: 'Rectangle', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1, rx: 0 },
    circle: { width: 90, height: 90, fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 1 },
    line: { width: 200, height: 2, stroke: '#1a1a1a', strokeWidth: 2 },
    image: { width: 140, height: 90, src: '', fit: 'contain' },
    qrcode: { width: 100, height: 100, variable: '{{PaymentQR}}', foreground: '#000000', background: '#ffffff' },
    barcode: { width: 180, height: 60, variable: '{{ProductCode}}', format: 'CODE128', foreground: '#000000', background: '#ffffff' },
    table: { width: 460, height: 140, columns: [{ id: nanoid(6), header: 'Product', field: 'product', width: 220, align: 'left' }, { id: nanoid(6), header: 'Qty', field: 'qty', width: 60, align: 'center' }, { id: nanoid(6), header: 'Price', field: 'price', width: 90, align: 'right' }, { id: nanoid(6), header: 'Total', field: 'total', width: 90, align: 'right' }], rowHeight: 26, headerHeight: 30, headerBg: '#111827', headerColor: '#ffffff', borderColor: '#d1d5db', fontSize: 12, dataSource: '{{Products}}' },
  };
  return { ...base, ...defaults[type], ...overrides, type } as TemplateObject;
}

export function makeHeader(page: PageConfig): TemplateObject[] {
  const top = page.margins.top + 4;
  const textLeft = page.margins.left + 92;
  const textWidth = page.width - textLeft - page.margins.right;
  return [
    makeObject('image', { name: 'Company logo', x: page.margins.left, y: top + 2, width: 76, height: 48, src: '', fit: 'contain', region: 'header' }),
    makeObject('text', { name: 'Company name', text: '{{CompanyName}}', x: textLeft, y: top, width: textWidth, height: 20, fontSize: 16, fontWeight: 'bold', region: 'header' }),
    makeObject('text', { name: 'Company address', text: '{{CompanyAddress}}', x: textLeft, y: top + 24, width: textWidth, height: 12, fontSize: 9, color: '#6b7280', region: 'header' }),
    makeObject('text', { name: 'Company phone', text: '{{CompanyPhone}}', x: textLeft, y: top + 40, width: textWidth, height: 12, fontSize: 9, color: '#6b7280', region: 'header' }),
    makeObject('line', { name: 'Header divider', x: page.margins.left, y: top + 60, width: page.width - page.margins.left - page.margins.right - 1, height: 1, stroke: '#d1d5db', strokeWidth: 1, region: 'header' }),
  ];
}

export function isLogoObject(item: TemplateObject): boolean {
  return item.region === 'header' && (item.type === 'image' || item.type === 'rect') && /logo/i.test(item.name);
}

export function makeFooter(page: PageConfig): TemplateObject[] {
  const top = page.height - Math.max(page.margins.bottom, 40);
  return [
    makeObject('line', { name: 'Footer divider', x: page.margins.left, y: top + 6, width: page.width - page.margins.left - page.margins.right, height: 1, stroke: '#d1d5db', region: 'footer' }),
    makeObject('text', { name: 'Footer note', text: 'Thank you for your business.', x: page.margins.left, y: top + 14, width: 260, height: 18, fontSize: 10, color: '#6b7280', region: 'footer' }),
    makeObject('text', { name: 'Page number', text: 'Page {{page}} of {{pages}}', x: page.width - page.margins.right - 140, y: top + 14, width: 140, height: 18, fontSize: 10, color: '#6b7280', align: 'right', region: 'footer' }),
  ];
}