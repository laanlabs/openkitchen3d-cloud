// Editing session for one project: selection, undo/redo, autosave, derived parts/checks/schedule.
import type { FinishIds, KitchenCabinetInstance, Opening, Project, Vec2, Wall } from '../model/types';
import { uid } from '../model/types';
import { add, alongWall, cabinetCenter, scale, wallDir, wallLength } from '../model/geometry';
import { applyVariant, attach, collides, drag as dragCabinet, followWalls, place, reflow } from '../layout/layout';
import { deriveRuns, diffGenerated, generateParts, schedule, scheduleTotal } from '../layout/runs';
import { validate } from '../layout/validation';
import { propose, type LayoutKind } from '../layout/templates';
import { catalogVersion, product, type Product, type Variant } from '../catalog/catalog';
import { saveProject } from '../io/storage';
import { track } from '../firebase';

export type Selection = { kind: 'cabinet' | 'wall' | 'opening'; id: string } | null;
export type ViewMode = '2d' | '3d' | 'split' | 'elevation';

export class Editor {
  project = $state.raw<Project>(null as unknown as Project);
  selection = $state<Selection>(null);
  view = $state<ViewMode>('split');
  elevationWallId = $state<string | null>(null);
  snap = $state(true);
  saveState = $state<'saved' | 'saving' | 'error'>('saved');
  toast = $state<{ text: string; detail?: string[]; id: number } | null>(null);
  readonly = false;

  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  undoCount = $state(0);
  redoCount = $state(0);
  private dragSnapshot: Project | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  parts = $derived(generateParts(this.project));
  warnings = $derived(validate(this.project));
  lines = $derived(schedule(this.project, this.parts));
  total = $derived(scheduleTotal(this.lines));
  runs = $derived(deriveRuns(this.project));

  constructor(p: Project, opts: { readonly?: boolean } = {}) {
    this.project = p;
    this.readonly = !!opts.readonly;
    this.elevationWallId = p.walls[0]?.id ?? null;
  }

  get selectedCabinet(): KitchenCabinetInstance | undefined {
    return this.selection?.kind === 'cabinet' ? this.project.kitchen.cabinets.find((c) => c.id === this.selection!.id) : undefined;
  }
  get selectedWall(): Wall | undefined {
    return this.selection?.kind === 'wall' ? this.project.walls.find((w) => w.id === this.selection!.id) : undefined;
  }
  get selectedOpening(): Opening | undefined {
    return this.selection?.kind === 'opening' ? this.project.openings.find((o) => o.id === this.selection!.id) : undefined;
  }

  // ---------- history ----------

  /** Applies a change as one undoable step and autosaves. */
  edit(change: (p: Project) => Project, notice?: string) {
    if (this.readonly) return;
    const before = this.project;
    const after = change(before);
    if (after === before) return;
    this.commit(before, { ...after, updatedAt: new Date().toISOString() });
    if (notice) this.notify(notice, diffGenerated(generateParts(before), this.parts));
  }

  private commit(before: Project, after: Project) {
    this.undoStack.push(before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.project = after;
    this.syncCounts();
    this.scheduleSave();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.project);
    this.project = prev;
    this.fixSelection();
    this.syncCounts();
    this.scheduleSave();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.project);
    this.project = next;
    this.fixSelection();
    this.syncCounts();
    this.scheduleSave();
  }

  private syncCounts() {
    this.undoCount = this.undoStack.length;
    this.redoCount = this.redoStack.length;
  }

  private fixSelection() {
    const s = this.selection;
    if (!s) return;
    const exists =
      s.kind === 'cabinet' ? this.project.kitchen.cabinets.some((c) => c.id === s.id)
      : s.kind === 'wall' ? this.project.walls.some((w) => w.id === s.id)
      : this.project.openings.some((o) => o.id === s.id);
    if (!exists) this.selection = null;
  }

  private scheduleSave() {
    if (this.readonly) return;
    this.saveState = 'saving';
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await saveProject(this.project);
        this.saveState = 'saved';
      } catch (e) {
        console.error(e);
        this.saveState = 'error';
      }
    }, 350);
  }

  async flush() {
    clearTimeout(this.saveTimer);
    if (!this.readonly) await saveProject(this.project);
    this.saveState = 'saved';
  }

  notify(text: string, detail: string[] = []) {
    const id = Date.now();
    this.toast = { text, detail, id };
    setTimeout(() => { if (this.toast?.id === id) this.toast = null; }, detail.length ? 6000 : 2600);
  }

  // ---------- cabinets ----------

  private setCabinets(p: Project, cabinets: KitchenCabinetInstance[]): Project {
    return { ...p, kitchen: { ...p.kitchen, cabinets } };
  }

  addProduct(prod: Product, variant?: Variant, at?: Vec2) {
    const preferred = this.selectedCabinet?.wallId ?? this.selectedWall?.id ?? this.selectedOpening?.wallId;
    let c = place(prod, this.project, preferred, variant);
    if (at) c = dragCabinet(c, at, this.project, this.snap);
    this.edit((p) => this.setCabinets(p, [...p.kitchen.cabinets, c]));
    this.selection = { kind: 'cabinet', id: c.id };
    track('add_cabinet', { product: prod.id });
  }

  updateCabinet(id: string, change: (c: KitchenCabinetInstance) => KitchenCabinetInstance, notice?: string) {
    this.edit((p) => {
      const i = p.kitchen.cabinets.findIndex((c) => c.id === id);
      if (i < 0) return p;
      const old = p.kitchen.cabinets[i];
      let c = change(old);
      if (c.wallId && (c.width !== old.width || c.depth !== old.depth)) c = reflow(c, old.width, p);
      const cabinets = [...p.kitchen.cabinets];
      cabinets[i] = c;
      return this.setCabinets(p, cabinets);
    }, notice);
  }

  setWidth(id: string, width: number) {
    this.updateCabinet(id, (c) => applyVariant(c, width));
  }

  rotate(id: string, by = 90) {
    this.updateCabinet(id, (c) => {
      const { wallId: _w, ...rest } = c;
      return { ...rest, rotation: (((c.rotation + by) % 360) + 360) % 360 };
    });
  }

  duplicate(id: string) {
    const c = this.project.kitchen.cabinets.find((x) => x.id === id);
    const prod = c && product(c.productId);
    if (!c || !prod) return;
    let copy: KitchenCabinetInstance = { ...structuredClone($state.snapshot(c)) as KitchenCabinetInstance, id: uid() };
    const wall = this.project.walls.find((w) => w.id === c.wallId);
    if (wall) {
      const s = alongWall(wall, cabinetCenter(c)) + c.width;
      const candidate = attach(copy, wall, s, this.project);
      copy = collides(candidate, this.project) ? { ...place(prod, this.project, wall.id), width: c.width, height: c.height, depth: c.depth, sku: c.sku, finishIds: c.finishIds } : candidate;
    } else {
      const off = add(cabinetCenter(c), scale({ x: 1, y: 1 }, 200));
      copy = { ...copy, anchor: { ...copy.anchor, x: off.x, y: off.y } };
    }
    this.edit((p) => this.setCabinets(p, [...p.kitchen.cabinets, copy]));
    this.selection = { kind: 'cabinet', id: copy.id };
  }

  remove(id: string) {
    const c = this.project.kitchen.cabinets.find((x) => x.id === id);
    if (!c) return;
    this.edit(
      (p) => this.setCabinets(p, p.kitchen.cabinets.filter((x) => x.id !== id)),
      `Removed ${product(c.productId)?.name ?? 'cabinet'} ${Math.round(c.width)}`
    );
    this.selection = null;
  }

  dragTo(id: string, point: Vec2) {
    if (this.readonly) return;
    const i = this.project.kitchen.cabinets.findIndex((c) => c.id === id);
    if (i < 0) return;
    if (!this.dragSnapshot) this.dragSnapshot = this.project;
    const cabinets = [...this.project.kitchen.cabinets];
    cabinets[i] = dragCabinet(cabinets[i], point, this.project, this.snap);
    this.project = this.setCabinets(this.project, cabinets);
  }

  /** Moves a wall-attached cabinet along its wall / changes its height (elevation view). */
  slideOnWall(id: string, s: number, elevation?: number) {
    if (this.readonly) return;
    const i = this.project.kitchen.cabinets.findIndex((c) => c.id === id);
    const c = this.project.kitchen.cabinets[i];
    const wall = c && this.project.walls.find((w) => w.id === c.wallId);
    if (!wall) return;
    if (!this.dragSnapshot) this.dragSnapshot = this.project;
    const lo = wall.thickness / 2 + c.width / 2, hi = wallLength(wall) - wall.thickness / 2 - c.width / 2;
    let moved = attach(c, wall, Math.min(Math.max(s, lo), hi), this.project);
    if (elevation != null) moved = { ...moved, anchor: { ...moved.anchor, elevation: Math.max(0, Math.min(elevation, this.project.ceilingHeight - c.height)) } };
    const cabinets = [...this.project.kitchen.cabinets];
    cabinets[i] = moved;
    this.project = this.setCabinets(this.project, cabinets);
  }

  endDrag() {
    const before = this.dragSnapshot;
    this.dragSnapshot = null;
    if (!before || before === this.project) return;
    this.commit(before, { ...this.project, updatedAt: new Date().toISOString() });
  }

  // ---------- style ----------

  applyStyle(style: Partial<FinishIds>, scope: 'kitchen' | 'run' | 'selected' = 'kitchen') {
    const sel = this.selectedCabinet;
    if (scope === 'kitchen') {
      this.edit((p) => ({
        ...p,
        kitchen: {
          ...p.kitchen,
          style: { ...p.kitchen.style, ...style },
          // Restyling the kitchen clears per-cabinet overrides of the same slots (appliances keep stainless).
          cabinets: p.kitchen.cabinets.map((c) => {
            const fi = { ...c.finishIds };
            for (const k of Object.keys(style) as (keyof FinishIds)[]) if (!(c.family === 'appliance' && k === 'front')) delete fi[k];
            return { ...c, finishIds: fi };
          })
        }
      }));
      return;
    }
    if (!sel) return;
    const ids = scope === 'selected' ? [sel.id] : this.runs.find((r) => r.cabinetIds.includes(sel.id))?.cabinetIds ?? [sel.id];
    this.edit((p) => this.setCabinets(p, p.kitchen.cabinets.map((c) => (ids.includes(c.id) ? { ...c, finishIds: { ...c.finishIds, ...style } } : c))));
  }

  // ---------- room ----------

  /** Changes a wall's length keeping its start; moves the shared corner of the connected wall too. Cabinets follow. */
  setWallLength(id: string, length: number) {
    if (length < 300) return;
    this.edit((p) => {
      const i = p.walls.findIndex((w) => w.id === id);
      if (i < 0) return p;
      const w = p.walls[i];
      const newEnd = add(w.start, scale(wallDir(w), length));
      const walls = p.walls.map((x, j) => {
        if (j === i) return { ...x, end: newEnd, verified: true };
        let y = x;
        if (Math.hypot(x.start.x - w.end.x, x.start.y - w.end.y) < 50) y = { ...y, start: newEnd };
        if (Math.hypot(x.end.x - w.end.x, x.end.y - w.end.y) < 50) y = { ...y, end: newEnd };
        return y;
      });
      return followWalls(p, { ...p, walls });
    });
  }

  updateWall(id: string, patch: Partial<Wall>) {
    this.edit((p) => followWalls(p, { ...p, walls: p.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  }

  setCeiling(height: number, verified = this.project.ceilingVerified) {
    this.edit((p) => ({ ...p, ceilingHeight: height, ceilingVerified: verified, walls: p.walls.map((w) => ({ ...w, height })) }));
  }

  addOpening(wallId: string, kind: Opening['kind']) {
    const o: Opening = kind === 'window'
      ? { id: uid(), wallId, kind, position: 0.5, width: 1000, height: 1150, sillHeight: 1050 }
      : { id: uid(), wallId, kind, position: 0.5, width: kind === 'door' ? 860 : 1200, height: 2050, sillHeight: 0, hingeLeft: true };
    this.edit((p) => ({ ...p, openings: [...p.openings, o] }));
    this.selection = { kind: 'opening', id: o.id };
  }

  updateOpening(id: string, patch: Partial<Opening>) {
    this.edit((p) => ({ ...p, openings: p.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }

  moveOpening(id: string, position: number) {
    if (this.readonly) return;
    if (!this.dragSnapshot) this.dragSnapshot = this.project;
    this.project = { ...this.project, openings: this.project.openings.map((o) => (o.id === id ? { ...o, position: Math.min(0.98, Math.max(0.02, position)) } : o)) };
  }

  removeOpening(id: string) {
    this.edit((p) => ({ ...p, openings: p.openings.filter((o) => o.id !== id) }));
    this.selection = null;
  }

  removeFixture(id: string) {
    this.edit((p) => ({ ...p, fixtures: p.fixtures.filter((f) => f.id !== id) }));
  }

  // ---------- project ----------

  applyLayout(kind: LayoutKind) {
    const had = this.project.kitchen.cabinets.length;
    this.edit((p) => propose(p, kind));
    this.selection = null;
    this.notify(had ? 'Layout replaced — undo to get your previous design back' : 'Starter layout added');
    track('apply_layout', { kind });
  }

  rename(name: string) {
    this.edit((p) => ({ ...p, name }));
  }

  update(patch: Partial<Project>) {
    this.edit((p) => ({ ...p, ...patch, ...(patch.catalogId ? { kitchen: { ...p.kitchen, catalogVersion: catalogVersion(patch.catalogId) } } : {}) }));
  }

  setCountertop(patch: Partial<Project['kitchen']['countertop']>) {
    this.edit((p) => ({ ...p, kitchen: { ...p.kitchen, countertop: { ...p.kitchen.countertop, ...patch } } }));
  }
}
