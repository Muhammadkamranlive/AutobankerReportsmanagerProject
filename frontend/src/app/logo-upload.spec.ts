import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as fabric from 'fabric';
import { vi } from 'vitest';
import { App } from './app';
import { makeHeader, makeObject } from './object-factory';
import { makePage } from './types';

describe('Letterhead logo upload', () => {
  beforeEach(async () => TestBed.configureTestingModule({ imports: [App] }).compileComponents());
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.chooseTemplate('Savings Account Statement');
    const input = document.createElement('input');
    app.logoUpload = new ElementRef(input);
    return { fixture, app, input, logo: app.logoSlots()[0] };
  }

  function uploadEvent(file?: File): Event {
    return { target: { files: file ? [file] : [], value: '' } } as unknown as Event;
  }

  it('opens the image picker directly from the logo slot', () => {
    const { fixture, app, input, logo } = setup();
    const click = vi.spyOn(input, 'click');
    app.openLogoPicker(logo.id);
    expect(click).toHaveBeenCalledOnce();
    expect(app.store.selectedId()).toBe(logo.id);
    fixture.destroy();
  });

  it('renders the letterhead inside the printable margins without overlapping contact lines', async () => {
    const { fixture, app } = setup();
    const page = app.template().page;
    const objects = app.template().objects.filter((item) => item.region === 'header');
    const rendered = await Promise.all(objects.map((item) => app['buildFabricObject'](item)));
    for (const object of rendered) {
      object.setCoords();
      const bounds = object.getBoundingRect();
      expect(bounds.left).toBeGreaterThanOrEqual(page.margins.left);
      expect(bounds.top).toBeGreaterThanOrEqual(page.margins.top);
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(page.width - page.margins.right);
    }
    const name = rendered[1].getBoundingRect();
    const address = rendered[2].getBoundingRect();
    const phone = rendered[3].getBoundingRect();
    expect(name.top + name.height).toBeLessThan(address.top);
    expect(address.top + address.height).toBeLessThan(phone.top);
    fixture.destroy();
  });

  it('embeds and auto-fits a logo without changing its slot, contacts, or the selected target', async () => {
    const { fixture, app, logo } = setup();
    const original = structuredClone(app.template().objects);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    vi.spyOn(fabric.FabricImage, 'fromURL').mockImplementation(async () => new fabric.FabricImage(canvas));
    app.openLogoPicker(logo.id);
    app.store.select(original[1].id);
    await app.onLogoImage(uploadEvent(new File(['bitmap'], 'bank.png', { type: 'image/png' })));
    expect(app.selected()).toMatchObject({ id: logo.id, type: 'image', fit: 'contain', x: logo.x, y: logo.y, width: 76, height: 48 });
    const uploaded = app.selected();
    expect(uploaded?.type === 'image' && uploaded.src).toMatch(/^data:image\/png;base64,/);
    expect(app.template().objects.slice(1)).toEqual(original.slice(1));
    app.store.undo();
    expect(app.logoSlots()[0]).toMatchObject({ src: '' });
    app.store.redo();
    expect(app.logoSlots()[0]).toMatchObject({ fit: 'contain' });
    expect(app.logoError()).toBe('');
    fixture.destroy();
  });

  it('keeps the existing logo after cancellation or an invalid file', async () => {
    const { fixture, app, logo } = setup();
    const original = app.template();
    app.openLogoPicker(logo.id);
    await app.onLogoImage(uploadEvent());
    expect(app.template()).toBe(original);
    app.openLogoPicker(logo.id);
    await app.onLogoImage(uploadEvent(new File(['text'], 'not-an-image.txt', { type: 'text/plain' })));
    expect(app.template()).toBe(original);
    expect(app.logoError()).toContain('Choose an image');
    expect(app.logoUploading()).toBe(false);
    fixture.destroy();
  });

  it('leaves the old logo unchanged when image decoding fails', async () => {
    const { fixture, app, logo } = setup();
    const original = app.template();
    vi.spyOn(fabric.FabricImage, 'fromURL').mockRejectedValue(new Error('Invalid image data'));
    app.openLogoPicker(logo.id);
    await app.onLogoImage(uploadEvent(new File(['corrupt'], 'bank.png', { type: 'image/png' })));
    expect(app.template()).toBe(original);
    expect(app.logoError()).toBe('Invalid image data');
    fixture.destroy();
  });

  it('upgrades an older logo rectangle to an image in the same position', async () => {
    const { fixture, app } = setup();
    const old = makeObject('rect', { name: 'Logo mark', region: 'header', x: 36, y: 42, width: 76, height: 48 });
    app.store.add(old);
    vi.spyOn(fabric.FabricImage, 'fromURL').mockImplementation(async () => new fabric.FabricImage(document.createElement('canvas')));
    app.openLogoPicker(old.id);
    await app.onLogoImage(uploadEvent(new File(['bitmap'], 'logo.png', { type: 'image/png' })));
    expect(app.selected()).toMatchObject({ id: old.id, type: 'image', fit: 'contain', x: 36, y: 42, width: 76, height: 48 });
    fixture.destroy();
  });

  it('positions the header preset inside custom margins with separate contact lines', () => {
    const page = makePage();
    page.margins = { top: 60, left: 50, right: 50, bottom: 36 };
    const objects = makeHeader(page);
    expect(objects[0]).toMatchObject({ type: 'image', src: '', fit: 'contain' });
    for (const item of objects) {
      expect(item.x).toBeGreaterThanOrEqual(50);
      expect(item.y).toBeGreaterThanOrEqual(60);
      expect(item.x + item.width).toBeLessThanOrEqual(page.width - 50);
    }
    const address = objects.find((item) => item.name === 'Company address')!;
    const phone = objects.find((item) => item.name === 'Company phone')!;
    expect(address.y + address.height).toBeLessThan(phone.y);
  });
});