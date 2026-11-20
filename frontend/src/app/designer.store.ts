import { signal, computed } from '@angular/core';
import { nanoid } from 'nanoid';
import { makePage, Template, TemplateObject } from './types';

export class DesignerStore {
  readonly template = signal<Template>(this.blankTemplate());
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() => this.template().objects.find((item) => item.id === this.selectedId()) ?? null);
  readonly zoom = signal(0.82);
  readonly showGrid = signal(true);
  readonly snapToGrid = signal(true);
  readonly gridSize = signal(10);
  private history: TemplateObject[][] = [[]];
  private historyIndex = 0;

  blankTemplate(name = 'Untitled Template'): Template {
    return { version: '1.0', name, page: makePage(), watermark: { enabled: false, text: 'DRAFT', color: '#cc0000', opacity: 0.15, fontSize: 96, rotation: -35 }, pagination: { enabled: false, format: 'Page {{page}} of {{pages}}', align: 'center' }, objects: [] };
  }

  setTemplate(patch: Partial<Template>): void { this.template.update((current) => ({ ...current, ...patch })); }
  add(object: TemplateObject): void { this.template.update((current) => ({ ...current, objects: [...current.objects, object] })); this.selectedId.set(object.id); this.commit(); }
  addMany(objects: TemplateObject[]): void { if (!objects.length) return; this.template.update((current) => ({ ...current, objects: [...current.objects, ...objects] })); this.selectedId.set(objects.at(-1)?.id ?? null); this.commit(); }
  update(id: string, patch: Partial<TemplateObject>): void { this.template.update((current) => ({ ...current, objects: current.objects.map((item) => item.id === id ? { ...item, ...patch } as TemplateObject : item) })); }
  remove(id: string): void { this.template.update((current) => ({ ...current, objects: current.objects.filter((item) => item.id !== id) })); if (this.selectedId() === id) this.selectedId.set(null); this.commit(); }
  duplicate(id: string): void { const item = this.template().objects.find((entry) => entry.id === id); if (!item) return; this.add({ ...structuredClone(item), id: nanoid(8), name: `${item.name} copy`, x: item.x + 12, y: item.y + 12 }); }
  move(id: string, direction: -1 | 1): void { const objects = [...this.template().objects]; const index = objects.findIndex((item) => item.id === id); const next = index + direction; if (index < 0 || next < 0 || next >= objects.length) return; [objects[index], objects[next]] = [objects[next], objects[index]]; this.setTemplate({ objects }); this.commit(); }
  select(id: string | null): void { this.selectedId.set(id); }
  load(template: Template): void { this.template.set(template); this.selectedId.set(null); this.history = [structuredClone(template.objects)]; this.historyIndex = 0; }
  commit(): void { this.history = [...this.history.slice(0, this.historyIndex + 1), structuredClone(this.template().objects)].slice(-60); this.historyIndex = this.history.length - 1; }
  undo(): void { if (this.historyIndex <= 0) return; this.historyIndex--; this.setTemplate({ objects: structuredClone(this.history[this.historyIndex]) }); this.selectedId.set(null); }
  redo(): void { if (this.historyIndex >= this.history.length - 1) return; this.historyIndex++; this.setTemplate({ objects: structuredClone(this.history[this.historyIndex]) }); this.selectedId.set(null); }
}