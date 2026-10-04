// Run solver: derives cabinet runs from wall attachment, then generates the parts users expect
// to be added automatically — countertop slabs (one per straight run, butt-jointed at corners),
// toe kicks, fillers and finished end panels. Generated parts are recomputed from the cabinets on
// every change (never stored), so save → reload reproduces identical geometry.
import {
  add, alongWall, cabinetCenter, cabinetCorners, dot, footprint, inwardNormal, scale, sub, v,
  wallDir, wallLength, rad, norm, perp
} from '../model/geometry';
import type { KitchenCabinetInstance, Project, Vec2, Wall } from '../model/types';
import { countertops, handlePrice, handles, product, swatch, TOE_KICK, variantFor } from '../catalog/catalog';
import { blocksOpening } from './layout';

export type Level = 'base' | 'wall';

export interface Run {
  id: string;
  wallId: string;
  level: Level;
  cabinetIds: string[];
  /** Span along the wall, mm from wall start. */
  lo: number;
  hi: number;
  depth: number;
}

export interface GeneratedPart {
  id: string;
  kind: 'countertop' | 'filler' | 'panel';
  center: Vec2;
  rotation: number;
  /** Along the run */
  width: number;
  depth: number;
  height: number;
  elevation: number;
  name: string;
  sku: string;
  price: number;
  /** m² for countertops */
  area?: number;
  finish?: string;
  sourceIds: string[];
}

const FILLER_MAX = 150;
const GAP_EPS = 3;
const PANEL_T = 19;

export const levelOf = (c: KitchenCabinetInstance): Level | 'tall' =>
  c.anchor.elevation >= 500 ? 'wall' : c.height >= 1200 ? 'tall' : 'base';

const isCabinetBody = (c: KitchenCabinetInstance) => ['base', 'wall', 'tall', 'island'].includes(c.family);
const hasTop = (c: KitchenCabinetInstance) => product(c.productId)?.hasCountertop ?? c.family === 'base';

export function deriveRuns(p: Project): Run[] {
  const runs: Run[] = [];
  for (const wall of p.walls) {
    for (const level of ['base', 'wall'] as Level[]) {
      const list = p.kitchen.cabinets
        .filter((c) => c.wallId === wall.id && levelOf(c) === level)
        .map((c) => ({ c, s: alongWall(wall, cabinetCenter(c)) }))
        .sort((a, b) => a.s - b.s);
      let cur: Run | null = null;
      for (const { c, s } of list) {
        const lo = s - c.width / 2, hi = s + c.width / 2;
        if (cur && lo - cur.hi <= GAP_EPS && lo >= cur.hi - GAP_EPS * 4) {
          cur.cabinetIds.push(c.id);
          cur.hi = Math.max(cur.hi, hi);
          cur.depth = Math.max(cur.depth, c.depth);
        } else {
          cur = { id: `${wall.id}:${level}:${runs.length}`, wallId: wall.id, level, cabinetIds: [c.id], lo, hi, depth: c.depth };
          runs.push(cur);
        }
      }
    }
  }
  return runs;
}

/** Intervals along `wall` blocked for a run at `level`: the wall's own ends, other runs/cabinets in its strip. */
function obstacles(p: Project, wall: Wall, level: Level, depth: number, exclude: Set<string>): [number, number][] {
  const L = wallLength(wall);
  const out: [number, number][] = [[-Infinity, wall.thickness / 2], [L - wall.thickness / 2, Infinity]];
  const n = inwardNormal(p, wall);
  const d = wallDir(wall);
  for (const c of p.kitchen.cabinets) {
    if (exclude.has(c.id)) continue;
    const lv = levelOf(c);
    if (lv !== level && lv !== 'tall') continue;
    const pts = cabinetCorners(c);
    const off = pts.map((q) => dot(sub(q, wall.start), n) - wall.thickness / 2);
    if (Math.max(...off) <= 1 || Math.min(...off) >= depth - 1) continue;
    const along = pts.map((q) => dot(sub(q, wall.start), d));
    out.push([Math.min(...along), Math.max(...along)]);
  }
  return out;
}

function placeOnWall(p: Project, wall: Wall, s: number, depth: number): { center: Vec2; rotation: number } {
  const n = inwardNormal(p, wall);
  return {
    center: add(add(wall.start, scale(wallDir(wall), s)), scale(n, wall.thickness / 2 + depth / 2)),
    rotation: (Math.atan2(-n.x, n.y) * 180) / Math.PI
  };
}

export function generateParts(p: Project): GeneratedPart[] {
  const parts: GeneratedPart[] = [];
  const byId = new Map(p.kitchen.cabinets.map((c) => [c.id, c]));
  const runs = deriveRuns(p);
  const { thickness: topT, overhang } = p.kitchen.countertop;
  const topFinish = swatch(countertops, p.kitchen.style.countertop);

  // ---- fillers and end panels at run ends ----
  for (const run of runs) {
    const wall = p.walls.find((w) => w.id === run.wallId)!;
    const cabs = run.cabinetIds.map((id) => byId.get(id)!);
    const obs = obstacles(p, wall, run.level, run.depth, new Set(run.cabinetIds));
    const ends: { side: 'lo' | 'hi'; at: number; cab: KitchenCabinetInstance }[] = [
      { side: 'lo', at: run.lo, cab: cabs[0] },
      { side: 'hi', at: run.hi, cab: cabs[cabs.length - 1] }
    ];
    for (const end of ends) {
      const gap =
        end.side === 'lo'
          ? end.at - Math.max(...obs.filter(([, b]) => b <= end.at + GAP_EPS).map(([, b]) => b))
          : Math.min(...obs.filter(([a]) => a >= end.at - GAP_EPS).map(([a]) => a)) - end.at;
      const c = end.cab;
      if (gap > GAP_EPS && gap <= FILLER_MAX) {
        const s = end.side === 'lo' ? end.at - gap / 2 : end.at + gap / 2;
        const probe = { ...c, width: gap, anchor: { ...c.anchor, ...placeOnWall(p, wall, s, c.depth).center } };
        if (blocksOpening(probe, wall, p)) continue;
        const pos = placeOnWall(p, wall, s, c.depth);
        // A gap between two runs gets one filler, not one from each side.
        if (parts.some((pt) => pt.kind === 'filler' && Math.hypot(pt.center.x - pos.center.x, pt.center.y - pos.center.y) < pt.width / 2 + 1 && Math.abs(pt.elevation - c.anchor.elevation) < 5)) continue;
        parts.push({
          id: `filler:${c.id}:${end.side}`, kind: 'filler', ...pos, width: gap, depth: c.depth, height: c.height,
          elevation: c.anchor.elevation, name: `Filler ${Math.round(gap)} mm`, sku: `FIL-${Math.round(gap)}`,
          price: 35, sourceIds: [c.id]
        });
      } else if (gap > FILLER_MAX && isCabinetBody(c)) {
        const s = end.side === 'lo' ? end.at - PANEL_T / 2 : end.at + PANEL_T / 2;
        const pos = placeOnWall(p, wall, s, c.depth);
        const kind = run.level === 'wall' ? 'wall' : levelOf(c) === 'tall' ? 'tall' : 'base';
        parts.push({
          id: `panel:${c.id}:${end.side}`, kind: 'panel', ...pos, width: PANEL_T, depth: c.depth, height: c.height,
          elevation: c.anchor.elevation, name: `Finished end panel — ${kind}`, sku: `EP-${kind.toUpperCase()}-${c.height}`,
          price: kind === 'tall' ? 160 : 85, sourceIds: [c.id]
        });
      }
    }
  }

  // Tall cabinets standing alone on a wall get panels via their own (base-level) runs only if level==='tall';
  // they are not part of base/wall runs, so treat each as its own run end.
  for (const c of p.kitchen.cabinets) {
    if (levelOf(c) !== 'tall' || !c.wallId || c.family !== 'tall') continue;
    const wall = p.walls.find((w) => w.id === c.wallId);
    if (!wall) continue;
    const s = alongWall(wall, cabinetCenter(c));
    const obsB = obstacles(p, wall, 'base', c.depth, new Set([c.id]));
    for (const side of ['lo', 'hi'] as const) {
      const at = side === 'lo' ? s - c.width / 2 : s + c.width / 2;
      const gap = side === 'lo'
        ? at - Math.max(...obsB.filter(([, b]) => b <= at + GAP_EPS).map(([, b]) => b))
        : Math.min(...obsB.filter(([a]) => a >= at - GAP_EPS).map(([a]) => a)) - at;
      if (gap > FILLER_MAX) {
        const pos = placeOnWall(p, wall, side === 'lo' ? at - PANEL_T / 2 : at + PANEL_T / 2, c.depth);
        parts.push({
          id: `panel:${c.id}:${side}`, kind: 'panel', ...pos, width: PANEL_T, depth: c.depth, height: c.height,
          elevation: 0, name: 'Finished end panel — tall', sku: `EP-TALL-${c.height}`, price: 160, sourceIds: [c.id]
        });
      } else if (gap > GAP_EPS) {
        const pos = placeOnWall(p, wall, side === 'lo' ? at - gap / 2 : at + gap / 2, c.depth);
        parts.push({
          id: `filler:${c.id}:${side}`, kind: 'filler', ...pos, width: gap, depth: c.depth, height: c.height,
          elevation: 0, name: `Tall filler ${Math.round(gap)} mm`, sku: `TF-${Math.round(gap)}`, price: 55, sourceIds: [c.id]
        });
      }
    }
  }

  // ---- countertops: one slab per straight segment of countertop-bearing base cabinets ----
  const slabs: (GeneratedPart & { axis: Vec2 })[] = [];
  for (const run of runs.filter((r) => r.level === 'base')) {
    const wall = p.walls.find((w) => w.id === run.wallId)!;
    const cabs = run.cabinetIds.map((id) => byId.get(id)!);
    const fillerParts = parts.filter((pt) => pt.kind !== 'countertop' && pt.sourceIds.some((id) => run.cabinetIds.includes(id)) && pt.elevation < 500 && pt.height < 1200);
    let seg: KitchenCabinetInstance[] = [];
    const flush = () => {
      if (!seg.length) return;
      let lo = Math.min(...seg.map((c) => alongWall(wall, cabinetCenter(c)) - c.width / 2));
      let hi = Math.max(...seg.map((c) => alongWall(wall, cabinetCenter(c)) + c.width / 2));
      // Extend over generated fillers/panels touching this segment.
      for (const f of fillerParts) {
        const fs = alongWall(wall, f.center);
        if (Math.abs(fs + f.width / 2 - lo) < GAP_EPS * 2) lo = fs - f.width / 2;
        if (Math.abs(fs - f.width / 2 - hi) < GAP_EPS * 2) hi = fs + f.width / 2;
      }
      const depth = Math.max(...seg.map((c) => c.depth)) + overhang;
      const top = Math.max(...seg.map((c) => c.anchor.elevation + c.height));
      const pos = placeOnWall(p, wall, (lo + hi) / 2, depth);
      slabs.push({
        id: `top:${seg[0].id}`, kind: 'countertop', ...pos, width: hi - lo, depth, height: topT, elevation: top,
        name: `Countertop — ${topFinish.name}`, sku: `CT-${topFinish.id}`, price: 0, finish: topFinish.id,
        sourceIds: seg.map((c) => c.id), axis: wallDir(wall)
      });
      seg = [];
    };
    for (const c of cabs) {
      if (hasTop(c) && (!seg.length || Math.abs(seg[0].anchor.elevation + seg[0].height - (c.anchor.elevation + c.height)) < 5)) seg.push(c);
      else { flush(); if (hasTop(c)) seg.push(c); }
    }
    flush();
  }
  // Merge collinear slabs on the same wall that touch (a filler between two runs keeps one slab).
  for (let i = 0; i < slabs.length; i++) {
    for (let j = slabs.length - 1; j > i; j--) {
      const a = slabs[i], b = slabs[j];
      if (Math.abs(a.rotation - b.rotation) > 0.01 || Math.abs(a.elevation - b.elevation) > 5 || Math.abs(a.depth - b.depth) > 1) continue;
      const ax = norm(a.axis);
      const off = sub(b.center, a.center);
      if (Math.abs(dot(off, perp(ax))) > 1) continue;
      const ac = dot(a.center, ax), bc = dot(b.center, ax);
      const lo = Math.min(ac - a.width / 2, bc - b.width / 2), hi = Math.max(ac + a.width / 2, bc + b.width / 2);
      if (hi - lo > a.width + b.width + GAP_EPS) continue;
      a.center = add(a.center, scale(ax, (lo + hi) / 2 - ac));
      a.width = hi - lo;
      a.sourceIds = [...a.sourceIds, ...b.sourceIds];
      slabs.splice(j, 1);
    }
  }
  // Islands and free-standing base cabinets: own slab with overhang all round.
  for (const c of p.kitchen.cabinets) {
    if (c.wallId || !hasTop(c) || levelOf(c) !== 'base') continue;
    const r = rad(c.rotation);
    const isl = c.family === 'island';
    slabs.push({
      id: `top:${c.id}`, kind: 'countertop', center: cabinetCenter(c), rotation: c.rotation,
      width: c.width + (isl ? overhang * 2 : 0), depth: c.depth + overhang * 2, height: topT,
      elevation: c.anchor.elevation + c.height, name: `Countertop — ${topFinish.name}`, sku: `CT-${topFinish.id}`,
      price: 0, finish: topFinish.id, sourceIds: [c.id], axis: v(Math.cos(r), Math.sin(r))
    });
  }
  // Butt joints: where two slabs overlap at a corner, trim the later one to the earlier one's edge.
  for (let i = 0; i < slabs.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = slabs[j], b = slabs[i];
      if (Math.abs(a.elevation - b.elevation) > 5) continue;
      const ca = footprint(a.center, a.rotation, a.width, a.depth);
      const cb = footprint(b.center, b.rotation, b.width, b.depth);
      if (!overlaps(ca, cb)) continue;
      const ax = norm(b.axis);
      if (Math.abs(dot(ax, norm(a.axis))) > 0.5) continue; // parallel slabs: leave alone
      const bc = dot(b.center, ax);
      let b0 = bc - b.width / 2, b1 = bc + b.width / 2;
      const pa = ca.map((q) => dot(q, ax));
      const a0 = Math.min(...pa), a1 = Math.max(...pa);
      if (a1 - b0 < b1 - a0) b0 = Math.max(b0, a1); else b1 = Math.min(b1, a0);
      if (b1 - b0 < 20) continue;
      const shift = (b0 + b1) / 2 - bc;
      b.center = add(b.center, scale(ax, shift));
      b.width = b1 - b0;
    }
  }
  for (const s of slabs) {
    s.area = (s.width * s.depth) / 1e6;
    s.price = Math.round(s.area * (topFinish.pricePerM2 ?? 400));
    const { axis: _a, ...part } = s;
    parts.push(part);
  }
  return parts;
}

function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const ax = norm(perp(sub(poly[(i + 1) % poly.length], poly[i])));
      const pa = a.map((q) => dot(q, ax)), pb = b.map((q) => dot(q, ax));
      if (Math.max(...pa) <= Math.min(...pb) + 1 || Math.max(...pb) <= Math.min(...pa) + 1) return false;
    }
  }
  return true;
}

// ---------- schedule / bill of materials ----------

export interface ScheduleLine {
  key: string;
  qty: number;
  sku: string;
  description: string;
  finish: string;
  width: number;
  depth: number;
  height: number;
  unitPrice: number;
  total: number;
  auto: boolean;
  ids: string[];
}

export function frontCount(c: KitchenCabinetInstance): number {
  const p = product(c.productId);
  if (!p) return 0;
  const vr = variantFor(p, c.width);
  if (p.fronts === 'doors' || p.fronts === 'sink' || p.fronts === 'drawers') return Math.max(1, vr.doors + vr.drawers);
  return 0;
}

export function cabinetPrice(c: KitchenCabinetInstance, p: Project): number {
  if (c.priceOverride != null) return c.priceOverride;
  const prod = product(c.productId);
  if (!prod) return 0;
  const base = prod.price({ ...variantFor(prod, c.width), width: c.width, height: c.height, depth: c.depth });
  const handle = c.finishIds.handle ?? p.kitchen.style.handle;
  return Math.round(base + (handle === 'none' ? 0 : frontCount(c) * handlePrice));
}

export function schedule(p: Project, parts = generateParts(p)): ScheduleLine[] {
  const lines = new Map<string, ScheduleLine>();
  const push = (l: Omit<ScheduleLine, 'qty' | 'total' | 'ids'>, id: string) => {
    const cur = lines.get(l.key);
    if (cur) { cur.qty++; cur.total += l.unitPrice; cur.ids.push(id); }
    else lines.set(l.key, { ...l, qty: 1, total: l.unitPrice, ids: [id] });
  };
  for (const c of p.kitchen.cabinets) {
    const prod = product(c.productId);
    const front = c.finishIds.front ?? p.kitchen.style.front;
    const unit = cabinetPrice(c, p);
    const key = [c.sku, front, c.width, c.depth, c.height, unit].join('|');
    push({ key, sku: c.sku, description: prod?.name ?? c.productId, finish: front, width: c.width, depth: c.depth, height: c.height, unitPrice: unit, auto: false }, c.id);
  }
  for (const g of parts) {
    if (g.kind === 'countertop') {
      lines.set(g.id, {
        key: g.id, qty: 1, sku: g.sku, description: `${g.name} (${g.area!.toFixed(2)} m²)`, finish: g.finish ?? '',
        width: Math.round(g.width), depth: Math.round(g.depth), height: g.height, unitPrice: g.price, total: g.price, auto: true, ids: [g.id]
      });
    } else {
      const key = [g.sku, g.width, g.height, g.depth].join('|');
      push({ key, sku: g.sku, description: g.name, finish: p.kitchen.style.front, width: Math.round(g.width), depth: g.depth, height: g.height, unitPrice: g.price, auto: true }, g.id);
    }
  }
  // Toe kick: linear metres under floor-standing cabinets (not appliances).
  const kick = p.kitchen.cabinets.filter((c) => c.anchor.elevation < 50 && (c.family === 'base' || c.family === 'tall' || c.family === 'island' || c.family === 'filler'));
  const kickLen = kick.reduce((s, c) => s + c.width + (c.family === 'island' ? c.width + 2 * c.depth : 0), 0);
  if (kickLen > 0) {
    const price = Math.round((kickLen / 1000) * 14);
    lines.set('toekick', {
      key: 'toekick', qty: 1, sku: `TK-${TOE_KICK}`, description: `Toe kick (${(kickLen / 1000).toFixed(2)} m)`, finish: p.kitchen.style.carcass,
      width: Math.round(kickLen), depth: 16, height: TOE_KICK, unitPrice: price, total: price, auto: true, ids: kick.map((c) => c.id)
    });
  }
  return [...lines.values()].sort((a, b) => Number(a.auto) - Number(b.auto) || a.sku.localeCompare(b.sku));
}

export const scheduleTotal = (lines: ScheduleLine[]) => lines.reduce((s, l) => s + l.total, 0);

/** Human-readable list of generated parts that change between two designs (parts-list integrity). */
export function diffGenerated(before: GeneratedPart[], after: GeneratedPart[]): string[] {
  const out: string[] = [];
  const b = new Map(before.map((g) => [g.id, g]));
  const a = new Map(after.map((g) => [g.id, g]));
  const label = (g: GeneratedPart) =>
    g.kind === 'countertop' ? `countertop ${(g.width / 1000).toFixed(2)} m` : g.name.toLowerCase();
  for (const [id, g] of b) {
    const n = a.get(id);
    if (!n) out.push(`removed ${label(g)}`);
    else if (Math.abs(n.width - g.width) > 1) out.push(`${label(g)} → ${(n.width / 1000).toFixed(2)} m`);
  }
  for (const [id, g] of a) if (!b.has(id)) out.push(`added ${label(g)}`);
  return out;
}

export { handles };
