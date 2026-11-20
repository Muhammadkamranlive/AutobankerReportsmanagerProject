import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, signal, computed } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import * as fabric from 'fabric';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { DesignerStore } from './designer.store';
import { makeObject, makeHeader, makeFooter, isLogoObject } from './object-factory';
import { LucideDatabase, LucideImagePlus, LucideChartColumn, LucidePlus, LucideTrash2, LucideDownload, LucideSave, LucideFileCheck } from '@lucide/angular';
import { PageSizeName, Template, TemplateObject } from './types';
import { buildTable } from './table-render';
import { STARTER_TEMPLATES, STARTER_TEMPLATE_CATEGORIES } from './starterTemplates';
import { parseTemplate } from './template-import';
import { buildImage, imageFrame } from './image-render';
import { ReportDataBuilder } from './report-data-builder';
import { QueryResult } from './report-query';
import { buildChartSvg, resolveData, resolveText } from './chart-render';
import { ReportTestPage } from './report-test-page';
import { SavedTemplate, createTestData, rememberTestData, savedTestData, serverResponse } from './template-testing';

type Tool = TemplateObject['type'];

@Component({
  selector: 'app-root',
  imports: [FormsModule, LucideImagePlus, LucideDatabase, LucideChartColumn, LucidePlus, LucideTrash2, LucideDownload, LucideSave, LucideFileCheck, ReportDataBuilder, ReportTestPage],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasElement?: ElementRef<HTMLCanvasElement>;
  @ViewChild('page') pageElement?: ElementRef<HTMLDivElement>;
  @ViewChild('logoUpload') logoUpload?: ElementRef<HTMLInputElement>;
  readonly store = new DesignerStore();
  readonly template = this.store.template;
  readonly selected = this.store.selected;
  readonly zoom = this.store.zoom;
  readonly Math = Math;
  readonly showGallery = signal(false);
  readonly search = signal('');
  readonly category = signal('All');
  readonly previewUrl = signal('');
  readonly trustedPreviewUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl()));
  readonly previewError = signal('');
  readonly busy = signal(false);
  readonly showDataBuilder = signal(false);
  readonly showTestReports = signal(false);
  readonly serverTemplateId = signal('');
  readonly saving = signal(false);
  readonly saveStatus = signal('');
  readonly saveError = signal('');
  readonly reportData = signal<Record<string, unknown>>({ ReportRows: [] });
  readonly dataBinding = computed(() => this.selected()?.type === 'table' ? `Table: ${this.selected()!.name}` : 'New report table');
  readonly importError = signal('');
  readonly renderWarnings = signal<string[]>([]);
  readonly logoError = signal('');
  readonly logoUploading = signal(false);
  readonly logoSlots = computed(() => this.template().objects.filter((item) => isLogoObject(item) && !item.hidden && !item.locked));
  readonly isLogo = isLogoObject;
  readonly apiUrl = '';
  readonly categories = STARTER_TEMPLATE_CATEGORIES;
  readonly templates = STARTER_TEMPLATES;
  readonly tools: { type: Tool; label: string; glyph: string }[] = [
    { type: 'text', label: 'Text', glyph: 'T' }, { type: 'rect', label: 'Rectangle', glyph: '▱' },
    { type: 'circle', label: 'Ellipse', glyph: '◯' }, { type: 'line', label: 'Line', glyph: '╱' },
    { type: 'image', label: 'Image', glyph: '▧' }, { type: 'qrcode', label: 'QR code', glyph: '▦' },
    { type: 'barcode', label: 'Barcode', glyph: '▥' }, { type: 'table', label: 'Table', glyph: '▤' },
    { type: 'chart', label: 'Chart', glyph: '' },
  ];
  readonly variables = ['{{InvoiceNo}}', '{{CustomerName}}', '{{Total}}', '{{CompanyName}}', '{{Date}}'];
  private canvas?: fabric.Canvas;
  private imageInsertPosition = { x: 60, y: 60 };
  private logoTargetId: string | null = null;
  private renderToken = 0;
  private readonly syncEffect = effect(() => {
    const objects = this.template().objects;
    const page = this.template().page;
    const zoom = this.zoom();
    this.reportData();
    if (this.canvas) void this.renderObjects(objects, page.width, page.height, zoom);
  });
  private readonly keyHandler = (event: KeyboardEvent) => this.onKeydown(event);
  private readonly resizeHandler = () => this.fitMobilePage();

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngAfterViewInit(): void {
    const element = this.canvasElement?.nativeElement;
    if (!element) return;
    this.canvas = new fabric.Canvas(element, { selection: false, preserveObjectStacking: true, backgroundColor: 'transparent' });
    this.canvas.on('selection:created', (event) => this.store.select((event.selected?.[0] as any)?.__templateId ?? null));
    this.canvas.on('selection:updated', (event) => this.store.select((event.selected?.[0] as any)?.__templateId ?? null));
    this.canvas.on('selection:cleared', () => this.store.select(null));
    this.canvas.on('object:modified', ({ target }) => {
      if (!target) return;
      const id = (target as any).__templateId as string;
      this.store.update(id, { x: Math.round(target.left ?? 0), y: Math.round(target.top ?? 0), width: Math.round((target.width ?? 1) * (target.scaleX ?? 1)), height: Math.round((target.height ?? 1) * (target.scaleY ?? 1)), rotation: Math.round(target.angle ?? 0) });
      target.set({ scaleX: 1, scaleY: 1 });
      this.store.commit();
    });
    this.canvas.on('object:moving', ({ target }) => {
      if (!target || !this.store.snapToGrid()) return;
      const step = this.store.gridSize();
      target.set({ left: Math.round((target.left ?? 0) / step) * step, top: Math.round((target.top ?? 0) / step) * step });
    });
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('resize', this.resizeHandler);
    this.fitMobilePage();
    void this.renderObjects(this.template().objects, this.template().page.width, this.template().page.height, this.zoom());
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('resize', this.resizeHandler);
    this.canvas?.dispose();
    this.syncEffect.destroy();
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
  }

  get filteredTemplates() {
    const q = this.search().trim().toLowerCase();
    return this.templates.filter((item) => (this.category() === 'All' || item.category === this.category()) && (!q || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(q)));
  }

  get pageStyle() {
    const page = this.template().page;
    return { width: `${page.width * this.zoom()}px`, height: `${page.height * this.zoom()}px` };
  }

  add(type: Tool, x = 60, y = 60): void {
    if (type === 'image') {
      this.imageInsertPosition = { x, y };
      document.getElementById('image-upload')?.click();
      return;
    }
    this.store.add(makeObject(type, { x, y }));
  }

  insertVariable(value: string): void {
    const selected = this.selected();
    if (selected?.type === 'text') this.store.update(selected.id, { text: `${selected.text ? selected.text + ' ' : ''}${value}` });
    else this.store.add(makeObject('text', { text: value }));
    this.store.commit();
  }

  onImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const position = this.imageInsertPosition;
    const reader = new FileReader();
    reader.onload = () => this.addDroppedObject(makeObject('image', { src: String(reader.result), ...position }));
    reader.readAsDataURL(file);
    input.value = '';
    this.imageInsertPosition = { x: 60, y: 60 };
  }

  replaceImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || this.selected()?.type !== 'image') return;
    const reader = new FileReader();
    reader.onload = () => this.patch({ src: String(reader.result) }, true);
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  openLogoPicker(id: string): void {
    const item = this.template().objects.find((object) => object.id === id);
    if (!item || !isLogoObject(item) || item.locked || this.logoUploading()) return;
    this.logoTargetId = id;
    this.logoError.set('');
    this.select(id);
    this.logoUpload?.nativeElement.click();
  }

  async onLogoImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.logoTargetId;
    input.value = '';
    this.logoTargetId = null;
    if (!file || !id) return;
    this.logoUploading.set(true);
    this.logoError.set('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the logo.');
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the logo image.'));
        reader.readAsDataURL(file);
      });
      const image = await fabric.FabricImage.fromURL(src);
      image.dispose();
      const target = this.template().objects.find((object) => object.id === id);
      if (!target || target.locked || !isLogoObject(target)) return;
      this.store.update(id, makeObject('image', { ...target, src, fit: 'contain' }));
      this.store.select(id);
      this.store.commit();
    } catch (error) {
      this.logoError.set(error instanceof Error ? error.message : 'Could not load the logo image.');
    } finally { this.logoUploading.set(false); }
  }

  updateTableColumn(id: string, patch: Record<string, unknown>): void {
    const item = this.selected();
    if (item?.type !== 'table') return;
    this.patch({ columns: item.columns.map((column) => column.id === id ? { ...column, ...patch } : column) }, true);
  }

  addTableColumn(): void {
    const item = this.selected();
    if (item?.type !== 'table') return;
    const index = item.columns.length + 1;
    this.patch({ columns: [...item.columns, { id: crypto.randomUUID(), header: `Column ${index}`, field: `field${index}`, width: 90, align: 'left' }] }, true);
  }

  updateChartSeries(index: number, patch: Record<string, unknown>): void {
    const item = this.selected();
    if (item?.type === 'chart') this.patch({ series: item.series.map((series, position) => position === index ? { ...series, ...patch } : series) }, true);
  }

  addChartSeries(): void {
    const item = this.selected();
    if (item?.type !== 'chart' || item.series.length >= 4 || item.chartType === 'donut') return;
    this.patch({ series: [...item.series, { field: 'walletsOpened', label: 'Wallets', color: '#367ac4' }] }, true);
  }

  removeChartSeries(index: number): void {
    const item = this.selected();
    if (item?.type === 'chart' && item.series.length > 1) this.patch({ series: item.series.filter((_, position) => position !== index) }, true);
  }

  setChartType(chartType: 'bar' | 'line' | 'donut'): void {
    const item = this.selected();
    if (item?.type === 'chart') this.patch({ chartType, series: chartType === 'donut' ? item.series.slice(0, 1) : item.series }, true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = this.pageElement?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round((event.clientX - rect.left) / this.zoom());
    const y = Math.round((event.clientY - rect.top) / this.zoom());
    const file = event.dataTransfer?.files[0];
    if (file?.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => this.addDroppedObject(makeObject('image', { src: String(reader.result), x, y }));
      reader.readAsDataURL(file);
      return;
    }
    const payload = event.dataTransfer?.getData('application/json');
    if (!payload) return;
    try {
      const data = JSON.parse(payload);
      if (data.type === 'variable' && typeof data.value === 'string') this.addDroppedObject(makeObject('text', { text: data.value, x, y }));
      else if (this.tools.some((tool) => tool.type === data.type)) {
        if (data.type === 'image') this.add('image', x, y);
        else this.addDroppedObject(makeObject(data.type as Tool, { x, y }));
      }
    } catch { /* malformed external drag data */ }
  }

  private addDroppedObject(item: TemplateObject): void {
    const page = this.template().page;
    item.x = Math.max(0, Math.min(page.width - item.width, item.x));
    item.y = Math.max(0, Math.min(page.height - item.height, item.y));
    this.store.add(item);
  }

  dragTool(event: DragEvent, type: Tool): void {
    event.dataTransfer?.setData('application/json', JSON.stringify({ type }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  dragVariable(event: DragEvent, value: string): void {
    event.dataTransfer?.setData('application/json', JSON.stringify({ type: 'variable', value }));
  }

  select(id: string): void {
    this.store.select(id);
    const target = this.canvas?.getObjects().find((item) => (item as any).__templateId === id);
    if (target && target.selectable && this.canvas) {
      this.canvas.setActiveObject(target);
      this.canvas.requestRenderAll();
    }
  }

  patch(patch: Partial<TemplateObject>, save = false): void {
    const selected = this.selected();
    if (!selected) return;
    this.store.update(selected.id, patch);
    if (save) this.store.commit();
  }

  patchPage(patch: Partial<Template['page']>): void {
    this.store.setTemplate({ page: { ...this.template().page, ...patch } });
  }

  setPageSize(pageSize: PageSizeName, orientation = this.template().page.orientation): void {
    const size = pageSize === 'Custom' ? 'A4' : pageSize;
    const sizes = { A4: [595, 842], Letter: [612, 792], Legal: [612, 1008] } as const;
    const [w, h] = sizes[size];
    this.patchPage({ size, orientation, width: orientation === 'portrait' ? w : h, height: orientation === 'portrait' ? h : w });
  }

  updateMargin(side: 'top' | 'right' | 'bottom' | 'left', value: number): void {
    this.patchPage({ margins: { ...this.template().page.margins, [side]: value } });
  }

  addPreset(region: 'header' | 'footer'): void {
    const items = region === 'header' ? makeHeader(this.template().page) : makeFooter(this.template().page);
    this.store.addMany(items);
  }

  chooseTemplate(name: string): void {
    const definition = this.templates.find((item) => item.name === name);
    if (!definition) return;
    this.resetServerTemplate();
    this.importError.set('');
    this.reportData.set(definition.sampleData?.() ?? { ReportRows: [] });
    this.store.load(definition.build());
    this.fitMobilePage();
    this.showGallery.set(false);
  }

  private fitMobilePage(): void {
    if (window.innerWidth > 780) return;
    const stage = this.pageElement?.nativeElement.closest('.canvas-stage');
    if (stage?.clientWidth) this.store.zoom.set(Math.max(.25, Math.min(.82, (stage.clientWidth - 24) / this.template().page.width)));
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.saveError.set('');
    this.saveStatus.set('');
    const template = structuredClone(this.template());
    const data = createTestData(template, this.reportData());
    const id = this.serverTemplateId();
    try {
      const response = await serverResponse(await fetch(`${this.apiUrl}/api/templates${id ? '/' + id : ''}`, {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(template),
      }));
      const saved = await response.json() as SavedTemplate;
      rememberTestData(saved.id, data);
      if (this.serverTemplateId() === id && this.template().name === template.name) {
        this.serverTemplateId.set(saved.id);
        this.saveStatus.set(`Saved to server: ${saved.name}`);
      }
    } catch (error) { this.saveError.set(error instanceof Error ? error.message : 'Could not save the template to the server.'); }
    finally { this.saving.set(false); }
  }

  openServerTemplate(saved: SavedTemplate): void {
    this.store.load(saved.template);
    this.reportData.set(savedTestData(saved));
    this.serverTemplateId.set(saved.id);
    this.saveStatus.set(`Opened server template: ${saved.name}`);
    this.saveError.set('');
    this.showTestReports.set(false);
    this.fitMobilePage();
  }

  private resetServerTemplate(): void {
    this.serverTemplateId.set('');
    this.saveStatus.set('');
    this.saveError.set('');
  }

  loadSaved(): void {
    const entries = Object.values(JSON.parse(localStorage.getItem('pdf-template-designer:templates') || '{}')) as { meta: { id: string; name: string }; template: Template }[];
    const chosen = prompt(`Saved templates:\n${entries.map((entry) => `${entry.meta.id}: ${entry.meta.name}`).join('\n')}\n\nEnter an ID to open:`);
    const match = entries.find((entry) => entry.meta.id === chosen);
    if (match) {
      this.resetServerTemplate();
      this.reportData.set({ ReportRows: [] });
      this.store.load(match.template);
      this.fitMobilePage();
    }
  }

  exportJson(): void {
    const blob = new Blob([JSON.stringify(this.template(), null, 2)], { type: 'application/json' });
    this.download(blob, `${this.template().name || 'report'}.json`);
  }

  downloadSampleData(): void {
    this.download(new Blob([JSON.stringify(this.reportData(), null, 2)], { type: 'application/json' }), 'synthetic-banking-aggregates.json');
  }

  newReport(): void {
    this.resetServerTemplate();
    this.reportData.set({ ReportRows: [] });
    this.store.load(this.store.blankTemplate());
    this.fitMobilePage();
  }

  async importJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importError.set('');
    try {
      const template = parseTemplate(JSON.parse(await file.text()));
      this.resetServerTemplate();
      this.reportData.set({ ReportRows: [] });
      this.store.load(template);
      this.fitMobilePage();
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'This file is not a valid report template.');
    } finally { input.value = ''; }
  }

  async previewPdf(): Promise<void> {
    this.busy.set(true);
    this.previewError.set('');
    try {
      const response = await fetch(`${this.apiUrl}/api/pdf/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: this.template(), data: this.reportData() }) });
      if (!response.ok) throw new Error(await response.text() || `Render service returned ${response.status}`);
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('The render service did not return a PDF.');
      if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
      this.previewUrl.set(URL.createObjectURL(await response.blob()));
    } catch (error) {
      this.previewError.set(error instanceof Error ? error.message : 'Could not render this report.');
    } finally { this.busy.set(false); }
  }

  async downloadSample(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/pdf/sample`);
      if (!response.ok) throw new Error(`Sample endpoint returned ${response.status}`);
      this.download(await response.blob(), 'sample-report.pdf');
    } catch (error) { this.previewError.set(error instanceof Error ? error.message : 'Could not download sample.'); }
  }

  closePreview(): void {
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl());
    this.previewUrl.set('');
  }

  applyReportData(result: QueryResult): void {
    const selected = this.selected();
    const page = this.template().page;
    const width = selected?.type === 'table' ? selected.width : page.width - page.margins.left - page.margins.right;
    const columns = result.columns.map(column => ({ ...column, id: crypto.randomUUID(), width: width / result.columns.length, align: 'left' as const }));
    this.reportData.update(data => ({ ...data, ReportRows: structuredClone(result.rows) }));
    if (selected?.type === 'table') {
      this.store.update(selected.id, { columns, dataSource: 'ReportRows' });
      this.store.commit();
    } else {
      this.store.add(makeObject('table', { name: 'Report results', region: 'body', x: page.margins.left, y: page.margins.top + 16, width, columns, dataSource: 'ReportRows' }));
    }
    this.showDataBuilder.set(false);
  }

  zoomBy(delta: number): void { this.store.zoom.set(Math.min(3, Math.max(0.25, +(this.zoom() + delta).toFixed(2)))); }
  setWatermark(patch: Partial<Template['watermark']>): void { this.store.setTemplate({ watermark: { ...this.template().watermark, ...patch } }); }
  setPagination(patch: Partial<Template['pagination']>): void { this.store.setTemplate({ pagination: { ...this.template().pagination, ...patch } }); }

  private async renderObjects(objects: TemplateObject[], width: number, height: number, zoom: number): Promise<void> {
    const canvas = this.canvas;
    if (!canvas) return;
    const token = ++this.renderToken;
    canvas.setDimensions({ width: width * zoom, height: height * zoom });
    canvas.setZoom(zoom);
    const results = await Promise.allSettled(objects.map((item) => this.buildFabricObject(item)));
    if (token !== this.renderToken || !this.canvas) return;
    const warnings: string[] = [];
    const built = results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      const item = objects[index];
      warnings.push(`Could not load "${item.name}". ${item.type === 'image' ? 'Replace its image with an embedded image or an accessible URL.' : 'Check its properties.'}`);
      const placeholder = imageFrame(item, `Unavailable ${item.type}`);
      placeholder.set({ angle: item.rotation, visible: !item.hidden, selectable: !item.locked, evented: !item.locked });
      return Object.assign(placeholder, { __templateId: item.id });
    });
    this.renderWarnings.set(warnings);
    const selectedId = this.store.selectedId();
    this.canvas.clear();
    for (const object of built) this.canvas.add(object);
    const active = built.find((object) => (object as any).__templateId === selectedId);
    if (active && active.selectable) this.canvas.setActiveObject(active);
    this.canvas.requestRenderAll();
  }

  private async buildFabricObject(item: TemplateObject): Promise<fabric.FabricObject> {
    const width = Math.max(1, Number.isFinite(item.width) ? item.width : 20);
    const height = Math.max(1, Number.isFinite(item.height) ? item.height : 20);
    let object: fabric.FabricObject;
    switch (item.type) {
      case 'text': object = new fabric.Textbox(resolveText(item.text, this.reportData()), { width, strokeWidth: 0, fontFamily: item.fontFamily, fontSize: item.fontSize, fontWeight: item.fontWeight, fontStyle: item.fontStyle, underline: item.underline, fill: item.color, backgroundColor: item.backgroundColor ?? undefined, textAlign: item.align, charSpacing: item.letterSpacing * 20 }); break;
      case 'rect': object = new fabric.Rect({ width, height, fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth, rx: item.rx, ry: item.rx }); break;
      case 'circle': object = new fabric.Ellipse({ rx: width / 2, ry: height / 2, fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth }); break;
      case 'line': object = new fabric.Line([0, 0, width, 0], { stroke: item.stroke, strokeWidth: item.strokeWidth }); break;
      case 'image': object = isLogoObject(item) && !item.src ? new fabric.Rect({ width, height, fill: 'transparent', strokeWidth: 0 }) : await buildImage(item); break;
      case 'qrcode': {
        const url = await QRCode.toDataURL(item.variable || 'QR', { margin: 1, color: { dark: item.foreground, light: item.background } });
        object = await fabric.FabricImage.fromURL(url); break;
      }
      case 'barcode': {
        const barcodeCanvas = document.createElement('canvas');
        try { JsBarcode(barcodeCanvas, item.variable || '0000000000', { format: item.format, lineColor: item.foreground, background: item.background, displayValue: true }); }
        catch { JsBarcode(barcodeCanvas, '0000000000', { format: 'CODE128', lineColor: item.foreground, background: item.background }); }
        object = await fabric.FabricImage.fromURL(barcodeCanvas.toDataURL()); break;
      }
      case 'table': {
        object = buildTable(item, this.reportData()); break;
      }
      case 'chart': {
        const svg = buildChartSvg(item, resolveData(this.reportData(), item.dataSource));
        const bytes = new TextEncoder().encode(svg);
        const base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
        object = await fabric.FabricImage.fromURL(`data:image/svg+xml;base64,${base64}`);
        object.set({ scaleX: width / Math.max(1, object.width), scaleY: height / Math.max(1, object.height) });
        break;
      }
    }
    object.set({ left: item.x, top: item.y, angle: item.rotation, selectable: !item.locked, evented: !item.locked, visible: !item.hidden, originX: 'left', originY: 'top' });
    (object as any).__templateId = item.id;
    if (item.type === 'qrcode' || item.type === 'barcode') {
      object.set({ scaleX: width / Math.max(1, object.width || width), scaleY: height / Math.max(1, object.height || height) });
    }
    return object;
  }

  private onKeydown(event: KeyboardEvent): void {
    if (this.showDataBuilder() || this.showTestReports()) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.store.redo() : this.store.undo(); }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.store.redo(); }
    else if (['Delete', 'Backspace'].includes(event.key) && this.selected()) { event.preventDefault(); this.store.remove(this.selected()!.id); }
    else if (this.selected() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const offset = event.shiftKey ? 10 : 1;
      const delta = { ArrowUp: [0, -offset], ArrowDown: [0, offset], ArrowLeft: [-offset, 0], ArrowRight: [offset, 0] }[event.key] ?? [0, 0];
      this.patch({ x: this.selected()!.x + delta[0], y: this.selected()!.y + delta[1] }, true);
    }
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[^a-z0-9._-]+/gi, '_');
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
