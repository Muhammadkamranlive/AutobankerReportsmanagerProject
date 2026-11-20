import { TestBed } from '@angular/core/testing';
import { App } from '../app';
import { Template } from '../types';
import { STARTER_TEMPLATES, STARTER_TEMPLATE_CATEGORIES } from './index';

function withoutObjectIds(template: Template): Template {
  return { ...template, objects: template.objects.map((object) => ({ ...object, id: '' })) };
}

describe('Starter templates', () => {
  it('exports all 25 original definitions and their categories', () => {
    expect(STARTER_TEMPLATES).toHaveLength(30);
    expect(new Set(STARTER_TEMPLATES.map((definition) => definition.id)).size).toBe(30);
    expect(STARTER_TEMPLATE_CATEGORIES).toEqual([
      'Statements', 'Account Letters', 'Loans & Cards', 'HR Letters',
      'Vouchers', 'Transactions', 'Digital Onboarding', 'Banking Dashboards',
    ]);
  });

  for (const definition of STARTER_TEMPLATES.filter(definition => !definition.sampleData)) {
    it(`${definition.name} keeps its letterhead inside the margins and tables within the page`, () => {
      const template = definition.build();
      expect(template.objects.length).toBeGreaterThan(10);
      expect(new Set(template.objects.map((object) => object.id)).size).toBe(template.objects.length);
      const logo = template.objects.find((object) => object.name === 'Bank logo');
      expect(logo).toMatchObject({
        type: 'image', x: 36, y: 42, width: 76, height: 48, src: '', fit: 'contain', region: 'header',
      });
      const bankName = template.objects.find((object) => object.name === 'Bank name');
      expect(bankName?.x).toBeGreaterThan((logo?.x ?? 0) + (logo?.width ?? 0));
      const address = template.objects.find((object) => object.name === 'Bank address');
      const phone = template.objects.find((object) => object.name === 'Bank phone');
      expect(phone?.y).toBeGreaterThanOrEqual((address?.y ?? 0) + (address?.height ?? 0));
      for (const header of template.objects.filter((object) => object.region === 'header')) {
        expect(header.x).toBeGreaterThanOrEqual(template.page.margins.left);
        expect(header.y).toBeGreaterThanOrEqual(template.page.margins.top);
        expect(header.x + header.width).toBeLessThanOrEqual(template.page.width - template.page.margins.right);
      }
      for (const table of template.objects.filter((object) => object.type === 'table')) {
        expect(table.x).toBeGreaterThanOrEqual(0);
        expect(table.y).toBeGreaterThanOrEqual(0);
        expect(table.width).toBeGreaterThan(0);
        expect(table.height).toBeGreaterThan(0);
        expect(table.x + table.width).toBeLessThanOrEqual(template.page.width);
        expect(table.y + table.height).toBeLessThanOrEqual(template.page.height);
        expect(table.columns.reduce((width, column) => width + column.width, 0)).toBeLessThanOrEqual(table.width);
      }
    });
  }

  it('retains the savings statement table, offer watermark, and digital verification QR layout', () => {
    const savings = STARTER_TEMPLATES[0].build();
    expect(savings.objects.find((object) => object.type === 'table')).toMatchObject({
      x: 36, y: 224, width: 523, height: 400, dataSource: '{{Transactions}}',
      columns: [
        { id: 'date', header: 'Date', field: 'date', width: 70, align: 'left' },
        { id: 'description', header: 'Description', field: 'description', width: 200, align: 'left' },
        { id: 'debit', header: 'Debit', field: 'debit', width: 80, align: 'right' },
        { id: 'credit', header: 'Credit', field: 'credit', width: 80, align: 'right' },
        { id: 'balance', header: 'Balance', field: 'balance', width: 93, align: 'right' },
      ],
    });
    const offer = STARTER_TEMPLATES.find((definition) => definition.id === 'loan-offer-letter')!.build();
    expect(offer.watermark).toMatchObject({ enabled: true, text: 'OFFER COPY' });
    const digital = STARTER_TEMPLATES.filter(definition => !definition.sampleData).at(-1)!.build();
    expect(digital.objects.find((object) => object.type === 'qrcode')).toMatchObject({
      name: 'QR Code', variable: '{{AccountVerificationURL}}', width: 100, height: 100,
    });
  });
});

describe('Starter gallery selection', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  for (const definition of STARTER_TEMPLATES) {
    it(`chooseTemplate loads the actual ${definition.name} layout`, () => {
      const app = TestBed.createComponent(App).componentInstance;
      app.store.add({ ...definition.build().objects[0], id: 'previous-selection' });
      app.showGallery.set(true);
      app.chooseTemplate(definition.name);
      expect(withoutObjectIds(app.template())).toEqual(withoutObjectIds(definition.build()));
      expect(app.selected()).toBeNull();
      expect(app.showGallery()).toBe(false);
      const firstObjects = app.template().objects;
      app.chooseTemplate(definition.name);
      expect(app.template().objects[0].id).not.toBe(firstObjects[0].id);
    });
  }

  it('leaves the document and gallery unchanged for an unknown template', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const original = app.template();
    app.showGallery.set(true);
    app.chooseTemplate('Unknown template');
    expect(app.template()).toBe(original);
    expect(app.showGallery()).toBe(true);
  });
});