import { Component, ElementRef, OnDestroy, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCheck, LucideDatabase, LucideDownload, LucidePlay, LucidePlus, LucideSave, LucideTrash2, LucideUpload, LucideX } from '@lucide/angular';
import { MAX_JSON_BYTES, QueryFilter, QueryJoin, QueryResult, QuerySelect, ReportQuery, aggregates, fieldSample, operators, parseFilterValue, parseJson, parseQuery, parseSources, qualifiedFields, queryError, sampleQuery } from './report-query';

type ValueMode = 'auto' | 'string' | 'json';
interface EditorFilter extends QueryFilter { raw: string; mode: ValueMode; }
type BuilderQuery = Omit<ReportQuery, 'filters'> & { filters: EditorFilter[] };
type Artifact = 'pdf' | 'xlsx' | 'csv' | 'docx' | 'all';

@Component({
  selector: 'app-report-data-builder',
  imports: [FormsModule, LucideCheck, LucideDatabase, LucideDownload, LucidePlay, LucidePlus, LucideSave, LucideTrash2, LucideUpload, LucideX],
  templateUrl: './report-data-builder.html',
  styleUrl: './report-data-builder.css',
})
export class ReportDataBuilder implements OnDestroy {
  readonly open = input(false);
  readonly apiUrl = input('');
  readonly binding = input('New report table');
  readonly applied = output<QueryResult>();
  readonly closed = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly query = signal<BuilderQuery>({ ...sampleQuery(), filters: [] });
  readonly result = signal<QueryResult | null>(null);
  readonly busy = signal('');
  readonly error = signal('');
  readonly fileBusy = signal(false);
  readonly collectionLabel = signal('Sample collections');
  readonly uploadAlias = signal('Source');
  readonly operators = operators;
  readonly aggregates = aggregates;
  readonly artifacts: { format: Artifact; label: string; mime: string; extension: string }[] = [
    { format: 'pdf', label: 'PDF', mime: 'application/pdf', extension: 'pdf' },
    { format: 'xlsx', label: 'XLSX', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
    { format: 'csv', label: 'CSV', mime: 'text/csv', extension: 'csv' },
    { format: 'docx', label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' },
    { format: 'all', label: 'ZIP All formats', mime: 'application/zip', extension: 'zip' },
  ];
  readonly paginatedExportReason = computed(() => this.query().select.length > 12 ? 'PDF, Word and All formats support at most 12 output columns.' : '');
  readonly fields = computed(() => qualifiedFields(this.query()));
  readonly activeSources = computed(() => [this.query().from, ...this.query().joins.map(join => join.source)]);
  readonly availableFields = computed(() => this.fields().filter(field => this.activeSources().includes(field.split('.')[0])));
  readonly validation = computed(() => {
    try { return queryError(this.payload()); }
    catch (error) { return this.message(error); }
  });
  readonly canExecute = computed(() => !this.validation() && !this.busy() && !this.fileBusy());
  readonly canUseResult = computed(() => this.canExecute() && this.result() !== null);
  readonly previewRows = computed(() => this.result()?.rows.slice(0, 100) ?? []);
  private controller?: AbortController;
  private requestVersion = 0;
  private fileVersion = 0;
  private destroyed = false;
  private readonly modalEffect = effect(() => {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;
    if (this.open()) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      this.cancel();
    }
  });

  ngOnDestroy(): void { this.destroyed = true; this.cancel(); this.modalEffect.destroy(); }
  close(): void { this.cancel(); this.closed.emit(); }
  cancel(): void {
    this.requestVersion++;
    this.controller?.abort();
    this.busy.set('');
    this.fileVersion++;
    this.fileBusy.set(false);
  }
  edit(update: (query: BuilderQuery) => BuilderQuery): void {
    this.controller?.abort();
    this.requestVersion++;
    this.busy.set('');
    this.result.set(null);
    this.error.set('');
    this.query.update(update);
  }
  payload(): ReportQuery {
    const query = this.query();
    return { ...query, filters: query.filters.map(({ field, operator, raw, mode }) => ({ field, operator, value: ['isNull', 'notNull'].includes(operator) ? null : parseFilterValue(raw, mode, fieldSample(query, field)) })) };
  }
  sourceFields(alias: string): string[] { return this.query().sources.find(source => source.alias === alias)?.fields ?? []; }
  joinLeftFields(index: number): string[] {
    const aliases = [this.query().from, ...this.query().joins.slice(0, index).map(join => join.source)];
    return this.fields().filter(field => aliases.includes(field.split('.')[0]));
  }
  renameSource(oldAlias: string, alias: string): void {
    const rename = (field: string) => field.startsWith(`${oldAlias}.`) ? `${alias}${field.slice(oldAlias.length)}` : field;
    this.edit(query => ({ ...query,
      sources: query.sources.map(source => source.alias === oldAlias ? { ...source, alias } : source),
      from: query.from === oldAlias ? alias : query.from,
      joins: query.joins.map(join => ({ ...join, source: join.source === oldAlias ? alias : join.source, left: rename(join.left), right: rename(join.right) })),
      select: query.select.map(column => ({ ...column, field: rename(column.field) })),
      filters: query.filters.map(filter => ({ ...filter, field: rename(filter.field) })), groupBy: query.groupBy.map(rename),
    }));
  }
  removeSource(index: number): void {
    this.edit(query => {
      const sources = query.sources.filter((_, position) => position !== index);
      const from = sources.some(source => source.alias === query.from) ? query.from : sources[0]?.alias ?? '';
      const reachable = new Set([from]);
      const joins = query.joins.filter(join => {
        if (!sources.some(source => source.alias === join.source) || reachable.has(join.source) || !reachable.has(join.left.split('.')[0])) return false;
        reachable.add(join.source);
        return true;
      });
      const hasField = (field: string) => reachable.has(field.split('.')[0]);
      const select = query.select.filter(column => column.field === '*' || hasField(column.field));
      return { ...query, sources, from, joins, select, filters: query.filters.filter(filter => hasField(filter.field)), groupBy: query.groupBy.filter(hasField), sort: query.sort.filter(sort => select.some(column => column.alias === sort.field)) };
    });
  }
  setFrom(from: string): void { this.edit(query => ({ ...query, from, joins: [] })); }
  addJoin(): void {
    const source = this.query().sources.find(source => !this.activeSources().includes(source.alias));
    if (!source) return;
    this.edit(query => ({ ...query, joins: [...query.joins, { source: source.alias, kind: 'left', left: this.availableFields()[0] ?? '', right: source.fields[0] ? `${source.alias}.${source.fields[0]}` : '' }] }));
  }
  patchJoin(index: number, patch: Partial<QueryJoin>): void {
    if (patch.source !== undefined) patch = { ...patch, right: this.sourceFields(patch.source)[0] ? `${patch.source}.${this.sourceFields(patch.source)[0]}` : '' };
    this.edit(query => ({ ...query, joins: query.joins.map((join, position) => position === index ? { ...join, ...patch } : join) }));
  }
  removeJoin(index: number): void { this.edit(query => ({ ...query, joins: query.joins.filter((_, position) => position !== index) })); }
  included(field: string): boolean { return this.query().select.some(column => column.field === field); }
  toggleField(field: string, include: boolean): void {
    if (include) this.addProjection(field);
    else this.edit(query => ({ ...query, select: query.select.filter(column => column.field !== field) }));
  }
  addProjection(field = this.availableFields()[0] ?? '*'): void {
    const base = field === '*' ? 'RowCount' : field.replaceAll('.', '_');
    let alias = base;
    let suffix = 2;
    while (this.query().select.some(column => column.alias === alias)) alias = `${base}_${suffix++}`;
    this.edit(query => ({ ...query, select: [...query.select, { field, alias, aggregate: field === '*' ? 'count' : 'none' }] }));
  }
  patchProjection(index: number, patch: Partial<QuerySelect>): void {
    this.edit(query => ({ ...query,
      select: query.select.map((column, position) => position === index ? { ...column, ...patch } : column),
      sort: patch.alias === undefined ? query.sort : query.sort.map(sort => sort.field === query.select[index].alias ? { ...sort, field: patch.alias! } : sort),
    }));
  }
  removeProjection(index: number): void { this.edit(query => ({ ...query, select: query.select.filter((_, position) => position !== index), sort: query.sort.filter(sort => sort.field !== query.select[index].alias) })); }
  toggleGroup(field: string, checked: boolean): void { this.edit(query => ({ ...query, groupBy: checked ? [...query.groupBy, field] : query.groupBy.filter(item => item !== field) })); }
  addFilter(): void {
    const field = this.availableFields()[0] ?? '';
    const sample = fieldSample(this.query(), field);
    this.edit(query => ({ ...query, filters: [...query.filters, { field, operator: 'eq', value: null, mode: 'auto', raw: typeof sample === 'string' ? '' : JSON.stringify(sample) }] }));
  }
  patchFilter(index: number, patch: Partial<EditorFilter>): void {
    if (patch.field !== undefined) {
      const sample = fieldSample(this.query(), patch.field);
      patch = { ...patch, mode: 'auto', raw: typeof sample === 'string' ? '' : JSON.stringify(sample) };
    }
    this.edit(query => ({ ...query, filters: query.filters.map((filter, position) => position === index ? { ...filter, ...patch } : filter) }));
  }
  removeFilter(index: number): void { this.edit(query => ({ ...query, filters: query.filters.filter((_, position) => position !== index) })); }
  filterInputType(filter: EditorFilter): string { return filter.mode === 'auto' && typeof fieldSample(this.query(), filter.field) === 'number' ? 'number' : 'text'; }
  isBoolean(filter: EditorFilter): boolean { return filter.mode === 'auto' && typeof fieldSample(this.query(), filter.field) === 'boolean'; }
  addSort(): void {
    const column = this.query().select.find(column => !this.query().sort.some(sort => sort.field === column.alias));
    if (column) this.edit(query => ({ ...query, sort: [...query.sort, { field: column.alias, descending: false }] }));
  }
  patchSort(index: number, patch: { field?: string; descending?: boolean }): void { this.edit(query => ({ ...query, sort: query.sort.map((sort, position) => position === index ? { ...sort, ...patch } : sort) })); }
  removeSort(index: number): void { this.edit(query => ({ ...query, sort: query.sort.filter((_, position) => position !== index) })); }
  resetSample(): void {
    this.cancel();
    this.edit(() => ({ ...sampleQuery(), filters: [] }));
    this.collectionLabel.set('Sample collections');
  }
  async importFile(event: Event, savedQuery = false): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cancel();
    const version = this.fileVersion;
    this.fileBusy.set(true);
    this.error.set('');
    try {
      if (file.size > MAX_JSON_BYTES) throw new Error('JSON exceeds 5 MB.');
      const text = await file.text();
      if (version !== this.fileVersion || this.destroyed) return;
      if (savedQuery) {
        const query = parseQuery(text);
        this.edit(() => ({ ...query, filters: query.filters.map(filter => ({ ...filter, raw: JSON.stringify(filter.value), mode: 'json' })) }));
      } else {
        const sources = parseSources(parseJson(text), this.uploadAlias());
        if (sources.some(source => this.query().sources.some(existing => existing.alias === source.alias))) throw new Error('Source alias already exists. Rename or remove the existing source first.');
        const combined = [...this.query().sources, ...sources];
        if (combined.length > 8 || combined.reduce((sum, source) => sum + source.rows.length, 0) > 10000) throw new Error('Use at most 8 sources and 10,000 input rows.');
        this.edit(query => ({ ...query, sources: combined, from: query.from || sources[0].alias }));
      }
      this.collectionLabel.set(savedQuery ? 'Saved query collections' : 'Uploaded collections');
    } catch (error) { if (version === this.fileVersion && !this.destroyed) this.error.set(this.message(error)); }
    finally { if (version === this.fileVersion && !this.destroyed) this.fileBusy.set(false); }
  }
  saveQuery(): void {
    if (!this.canExecute()) return;
    this.download(new Blob([JSON.stringify(this.payload(), null, 2)], { type: 'application/json' }), 'report-query.json');
  }
  async execute(): Promise<void> { await this.request(); }
  canExport(format: Artifact): boolean { return this.canUseResult() && !this.exportReason(format); }
  exportReason(format: Artifact): string { return ['pdf', 'docx', 'all'].includes(format) ? this.paginatedExportReason() : ''; }
  async exportResult(format: Artifact): Promise<void> { if (this.canExport(format)) await this.request(format); }
  apply(): void { const result = this.result(); if (result && this.canUseResult()) this.applied.emit(structuredClone(result)); }
  cell(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
  private async request(format?: Artifact): Promise<void> {
    if (!this.canExecute()) return;
    const query = structuredClone(this.payload());
    const version = ++this.requestVersion;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const artifact = this.artifacts.find(artifact => artifact.format === format);
    this.busy.set(artifact ? `Exporting ${artifact.label}` : 'Executing');
    this.error.set('');
    if (!format) this.result.set(null);
    const current = () => version === this.requestVersion && !controller.signal.aborted && !this.destroyed;
    try {
      const endpoint = format === 'pdf' ? '/api/reports/query/pdf' : format ? `/api/reports/export/${format}` : '/api/reports/query';
      const mime = artifact?.mime ?? 'application/json';
      const response = await fetch(`${this.apiUrl()}${endpoint}`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: mime }, body: JSON.stringify(query) });
      if (!current()) return;
      if (!response.ok) {
        let detail = `Request failed (${response.status}).`;
        if (response.headers.get('content-type')?.includes('json')) {
          const problem: unknown = await response.json();
          if (problem && typeof problem === 'object' && 'detail' in problem && typeof problem.detail === 'string') detail = problem.detail;
        }
        throw new Error(detail);
      }
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== mime) throw new Error(`Unexpected response type. Expected ${artifact?.label ?? 'JSON'}.`);
      if (artifact) {
        const blob = await response.blob();
        if (current()) {
          if (!blob.size) throw new Error('The exported file is empty.');
          const disposition = response.headers.get('content-disposition') ?? '';
          const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
          this.download(blob, filename?.toLowerCase().endsWith(`.${artifact.extension}`) ? filename : `report-results.${artifact.extension}`);
        }
      } else {
        const result: QueryResult = await response.json();
        if (!result || !Array.isArray(result.columns) || !Array.isArray(result.rows) || result.rows.length > 10000 || result.columns.length !== query.select.length || !Number.isFinite(result.inputRows) || result.inputRows < 0 || !result.columns.every((column, index) => column && column.field === query.select[index].alias && typeof column.header === 'string') || !result.rows.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))) throw new Error('Invalid query result returned by the service.');
        if (current()) this.result.set(result);
      }
    } catch (error) { if (current()) this.error.set(this.message(error)); }
    finally { if (current()) this.busy.set(''); }
  }
  private message(error: unknown): string { return error instanceof Error ? error.message : 'The operation failed.'; }
  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[^a-z0-9._-]+/gi, '_').replace(/^\.+/, '') || 'report-results';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}