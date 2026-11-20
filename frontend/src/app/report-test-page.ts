import { Component, OnDestroy, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { LucideArrowLeft, LucideDownload, LucideFileCheck, LucideFolderOpen, LucideRefreshCw } from '@lucide/angular';
import { parseTemplate } from './template-import';
import { SavedTemplate, SavedTemplateSummary, TestGeneration, savedTestData, serverResponse } from './template-testing';

@Component({
  selector: 'app-report-test-page',
  imports: [FormsModule, LucideArrowLeft, LucideDownload, LucideFileCheck, LucideFolderOpen, LucideRefreshCw],
  templateUrl: './report-test-page.html',
  styleUrl: './report-test-page.css',
})
export class ReportTestPage implements OnInit, OnDestroy {
  readonly apiUrl = input('');
  readonly initialId = input('');
  readonly closed = output<void>();
  readonly opened = output<SavedTemplate>();
  readonly templates = signal<SavedTemplateSummary[]>([]);
  readonly selectedId = signal('');
  readonly selected = signal<SavedTemplate | null>(null);
  readonly sampleData = signal<Record<string, unknown>>({});
  readonly result = signal<TestGeneration | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly previewUrl = signal('');
  readonly trustedPreview = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl()));
  readonly dataText = computed(() => JSON.stringify(this.sampleData(), null, 2));
  private readonly urls = new Map<string, string>();

  constructor(private readonly sanitizer: DomSanitizer) {}
  ngOnInit(): void { void this.refresh(); }
  ngOnDestroy(): void { this.clearArtifacts(); }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await serverResponse(await fetch(`${this.apiUrl()}/api/templates`));
      this.templates.set((await response.json() as SavedTemplateSummary[]).sort((left, right) => right.savedAtUtc.localeCompare(left.savedAtUtc)));
      const id = this.selectedId() || this.initialId() || this.templates()[0]?.id;
      if (id) await this.select(id);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not load server templates.'); }
    finally { this.busy.set(false); }
  }

  async select(id: string): Promise<void> {
    this.clearArtifacts();
    this.selected.set(null);
    this.selectedId.set(id);
    this.error.set('');
    this.busy.set(true);
    try {
      const response = await serverResponse(await fetch(`${this.apiUrl()}/api/templates/${encodeURIComponent(id)}`));
      const saved = await response.json() as SavedTemplate;
      saved.template = parseTemplate(saved.template);
      this.selected.set(saved);
      this.sampleData.set(savedTestData(saved));
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not open the saved template.'); }
    finally { this.busy.set(false); }
  }

  async generate(): Promise<void> {
    const saved = this.selected();
    if (!saved || this.busy()) return;
    this.clearArtifacts();
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await serverResponse(await fetch(`${this.apiUrl()}/api/templates/${saved.id}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.sampleData()),
      }));
      const result = await response.json() as TestGeneration;
      for (const file of result.files) {
        const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
        this.urls.set(file.format, URL.createObjectURL(new Blob([bytes], { type: file.contentType })));
      }
      this.result.set(result);
      this.previewUrl.set(this.urls.get('pdf') ?? '');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not generate the test report.'); }
    finally { this.busy.set(false); }
  }

  download(format: string): void {
    const url = this.urls.get(format);
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.result()?.name || 'test-report'}.${format}`.replace(/[^a-z0-9._-]+/gi, '_');
    anchor.click();
  }

  downloadData(): void {
    const url = URL.createObjectURL(new Blob([this.dataText()], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sample-data.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private clearArtifacts(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.previewUrl.set('');
    this.result.set(null);
  }
}