// Room templates, the new-project factory and one-click starter layouts (one-wall, galley, L, U, island).
import { alongWall, cabinetCenter, inwardNormal, interiorPoint, polygonArea, wallDir, wallLength, v } from '../model/geometry';
import type { CatalogId, KitchenCabinetInstance, Opening, Project, Units, Vec2, Wall } from '../model/types';
import { uid } from '../model/types';
import { catalogVersion, COUNTERTOP, defaultStyle, productForRole, productsFor, type Product, type Role, type Variant } from '../catalog/catalog';
import { attach, collides, blocksOpening, firstFreeSlot, makeCabinet, place } from './layout';
import { validate } from './validation';

export type RoomShape = 'rectangle' | 'l' | 'galley' | 'open';
export interface RoomParams {
  shape: RoomShape;
  /** Inside dimensions, mm */
  width: number;
  depth: number;
  notchWidth: number;
  notchDepth: number;
  ceiling: number;
}

export const roomShapes: { id: RoomShape; name: string }[] = [
  { id: 'rectangle', name: 'Rectangle' },
  { id: 'l', name: 'L-shaped' },
  { id: 'galley', name: 'Galley' },
  { id: 'open', name: 'Open plan' }
];

export const defaultRoom = (shape: RoomShape = 'rectangle'): RoomParams => ({
  shape,
  width: shape === 'galley' ? 4200 : shape === 'open' ? 5200 : 4200,
  depth: shape === 'galley' ? 2400 : 3400,
  notchWidth: 1500,
  notchDepth: 1200,
  ceiling: 2400
});

const T = 120;

/** Walls on the centre-line of an inside polygon given clockwise-on-screen (x right, y down). */
function wallsFromInside(inside: Vec2[], height: number): Wall[] {
  // Offset the inside polygon outward by T/2 to get the centre-line polygon.
  const n = inside.length;
  const ccw = polygonArea(inside) > 0;
  const lines = inside.map((a, i) => {
    const b = inside[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    const d = v(dx / l, dy / l);
    const out = ccw ? v(d.y, -d.x) : v(-d.y, d.x);
    return { p: v(a.x + out.x * T / 2, a.y + out.y * T / 2), d };
  });
  const pts = lines.map((l, i) => {
    const prev = lines[(i - 1 + n) % n];
    const den = prev.d.x * l.d.y - prev.d.y * l.d.x;
    const w = v(l.p.x - prev.p.x, l.p.y - prev.p.y);
    const s = (w.x * l.d.y - w.y * l.d.x) / den;
    return v(prev.p.x + prev.d.x * s, prev.p.y + prev.d.y * s);
  });
  return pts.map((a, i) => ({
    id: uid(), start: a, end: pts[(i + 1) % n], height, thickness: T, verified: false
  }));
}

export function buildRoom(r: RoomParams): { walls: Wall[]; openings: Opening[] } {
  const W = r.width, D = r.depth;
  let inside: Vec2[];
  if (r.shape === 'l') {
    const nw = Math.min(r.notchWidth, W - 900), nd = Math.min(r.notchDepth, D - 900);
    inside = [v(0, 0), v(W, 0), v(W, D - nd), v(W - nw, D - nd), v(W - nw, D), v(0, D)];
  } else inside = [v(0, 0), v(W, 0), v(W, D), v(0, D)];
  const walls = wallsFromInside(inside, r.ceiling);
  const openings: Opening[] = [];
  const op = (wall: Wall, kind: Opening['kind'], position: number, width: number, height: number, sill = 0): Opening => ({
    id: uid(), wallId: wall.id, kind, position, width, height, sillHeight: sill, hingeLeft: true
  });
  // Back wall (top) gets a window; the front (bottom) wall a door — editable afterwards.
  const top = walls[0];
  const bottom = r.shape === 'l' ? walls[4] : walls[2];
  if (r.shape === 'galley') {
    openings.push(op(walls[1], 'door', 0.5, 860, 2050));
    openings.push(op(walls[3], 'window', 0.5, 1000, 1150, 1050));
  } else if (r.shape === 'open') {
    openings.push(op(top, 'window', 0.5, 1400, 1150, 1050));
    openings.push(op(bottom, 'opening', 0.5, Math.min(3000, wallLength(bottom) - 600), 2100));
  } else {
    openings.push(op(top, 'window', 0.5, 1200, 1150, 1050));
    openings.push(op(bottom, 'door', 0.78, 860, 2050));
  }
  return { walls, openings };
}

export function newProject(opts: { name: string; room: RoomParams; catalogId: CatalogId; units: Units }): Project {
  const now = new Date().toISOString();
  const { walls, openings } = buildRoom(opts.room);
  return {
    schema: 'openkitchen3d/web-project@0.1',
    id: uid(),
    name: opts.name,
    createdAt: now,
    updatedAt: now,
    catalogId: opts.catalogId,
    units: opts.units,
    captureSource: 'web',
    ceilingHeight: opts.room.ceiling,
    ceilingVerified: false,
    walls,
    openings,
    fixtures: [],
    kitchen: {
      catalogVersion: catalogVersion(opts.catalogId),
      cabinets: [],
      style: { ...defaultStyle },
      countertop: { ...COUNTERTOP },
      currency: 'USD'
    }
  };
}

// ---------- starter layouts ----------

export type LayoutKind = 'empty' | 'one-wall' | 'galley' | 'l' | 'u' | 'island';
export const layoutKinds: { id: LayoutKind; name: string; blurb: string }[] = [
  { id: 'one-wall', name: 'One wall', blurb: 'Everything along one wall' },
  { id: 'galley', name: 'Galley', blurb: 'Two parallel runs' },
  { id: 'l', name: 'L-shaped', blurb: 'Two walls meeting in a corner' },
  { id: 'u', name: 'U-shaped', blurb: 'Three walls of storage' },
  { id: 'island', name: 'L + island', blurb: 'Corner run with an island' },
  { id: 'empty', name: 'Empty room', blurb: 'Start from scratch' }
];

const withCabinet = (p: Project, c: KitchenCabinetInstance): Project => ({
  ...p, kitchen: { ...p.kitchen, cabinets: [...p.kitchen.cabinets, c] }
});

function nearestVariant(prod: Product, target: number, maxWidth = Infinity): Variant | undefined {
  const fits = prod.variants.filter((x) => x.width <= maxWidth + 1);
  if (!fits.length) return undefined;
  return fits.reduce((b, x) => (Math.abs(x.width - target) < Math.abs(b.width - target) ? x : b));
}

function placeRole(p: Project, role: Role, wall: Wall, target = 600): Project {
  const prod = productForRole(p.catalogId, role);
  if (!prod) return p;
  const vr = nearestVariant(prod, target);
  if (!vr) return p;
  const slot = firstFreeSlot(makeCabinet(prod, p, vr), wall, p);
  return slot ? withCabinet(p, slot) : p;
}

function placeAt(p: Project, role: Role, wall: Wall, s: number, target = 600): Project {
  const prod = productForRole(p.catalogId, role);
  if (!prod) return p;
  const vr = nearestVariant(prod, target);
  if (!vr) return p;
  const c = attach(makeCabinet(prod, p, vr), wall, s, p);
  return collides(c, p) || blocksOpening(c, wall, p) ? p : withCabinet(p, c);
}

/** Fills the free space along a wall with base/drawer cabinets, widest first. */
function fillBase(p: Project, wall: Wall): Project {
  const cands = productsFor(p.catalogId)
    .filter((x) => x.role === 'base' || x.role === 'drawer')
    .flatMap((prod) => prod.variants.filter((vr) => vr.width >= 300).map((vr) => ({ prod, vr })))
    .sort((a, b) => b.vr.width - a.vr.width);
  for (let guard = 0; guard < 40; guard++) {
    let placed = false;
    for (const { prod, vr } of cands) {
      const slot = firstFreeSlot(makeCabinet(prod, p, vr), wall, p);
      if (slot) { p = withCabinet(p, slot); placed = true; break; }
    }
    if (!placed) break;
  }
  return p;
}

/** Wall cabinets above the base run of `wall`: hood over the range, nothing over fridges/talls or windows. */
function fillWallCabinets(p: Project, wall: Wall): Project {
  const wallProds = productsFor(p.catalogId).filter((x) => x.family === 'wall' && x.fronts === 'doors');
  const variants = wallProds.flatMap((prod) => prod.variants.filter((vr) => vr.height >= 700 && vr.height <= 800).map((vr) => ({ prod, vr })));
  const base = p.kitchen.cabinets
    .filter((c) => c.wallId === wall.id && c.anchor.elevation < 500)
    .sort((a, b) => alongWall(wall, cabinetCenter(a)) - alongWall(wall, cabinetCenter(b)));
  for (const c of base) {
    const prod = productForRole(p.catalogId, 'range');
    const s = alongWall(wall, cabinetCenter(c));
    if (c.height > 1200) continue;
    if (prod && c.productId === prod.id) {
      const hood = productForRole(p.catalogId, 'hood');
      if (hood) {
        const vr = nearestVariant(hood, c.width);
        if (vr) {
          const h = attach(makeCabinet(hood, p, vr), wall, s, p);
          if (!collides(h, p) && !blocksOpening(h, wall, p)) p = withCabinet(p, h);
        }
      }
      continue;
    }
    const best = variants.filter((x) => x.vr.width <= c.width + 1).sort((a, b) => b.vr.width - a.vr.width)[0];
    if (!best) continue;
    const wc = attach(makeCabinet(best.prod, p, best.vr), wall, s, p);
    if (!collides(wc, p) && !blocksOpening(wc, wall, p)) p = withCabinet(p, wc);
  }
  return p;
}

const doorCount = (p: Project, w: Wall) => p.openings.filter((o) => o.wallId === w.id && o.kind !== 'window').length;
const windowOf = (p: Project, w: Wall) => p.openings.find((o) => o.wallId === w.id && o.kind === 'window');

/** Proposes a starter layout for the current room. Cabinets that would produce errors are dropped. */
export function propose(base: Project, kind: LayoutKind): Project {
  let p: Project = { ...base, kitchen: { ...base.kitchen, cabinets: [] } };
  if (kind === 'empty' || !p.walls.length) return p;
  const walls = p.walls;
  const idx = (w: Wall) => walls.indexOf(w);
  const at = (i: number) => walls[(i + walls.length) % walls.length];
  // Primary wall: longest wall without a door, preferring one with a window for the sink.
  const ranked = [...walls].sort(
    (a, b) => doorCount(p, a) - doorCount(p, b) || Number(!!windowOf(p, b)) - Number(!!windowOf(p, a)) || wallLength(b) - wallLength(a)
  );
  const primary = ranked[0];
  const i0 = idx(primary);
  const next = at(i0 + 1), prev = at(i0 - 1);
  const opposite = walls.length === 4 ? at(i0 + 2) : [...walls].filter((w) => w !== primary && w !== next && w !== prev).sort((a, b) => wallLength(b) - wallLength(a))[0];
  const side = doorCount(p, next) <= doorCount(p, prev) ? next : prev;

  const sinkFirst = (wall: Wall) => {
    const win = windowOf(p, wall);
    if (win) {
      const s = win.position * wallLength(wall);
      p = placeAt(p, 'sink', wall, s, 800);
      const sink = p.kitchen.cabinets[p.kitchen.cabinets.length - 1];
      if (sink) {
        const dw = productForRole(p.catalogId, 'dishwasher');
        const vr = dw && nearestVariant(dw, 600);
        if (dw && vr) p = placeAt(p, 'dishwasher', wall, s + sink.width / 2 + vr.width / 2, vr.width);
      }
    } else {
      p = placeRole(p, 'sink', wall, 800);
      p = placeRole(p, 'dishwasher', wall, 600);
    }
  };

  switch (kind) {
    case 'one-wall':
      p = placeRole(p, 'fridge', primary, 700);
      p = placeRole(p, 'drawer', primary, 600);
      sinkFirst(primary);
      p = placeRole(p, 'range', primary, 600);
      p = fillBase(p, primary);
      p = fillWallCabinets(p, primary);
      break;
    case 'galley':
      p = placeRole(p, 'fridge', primary, 700);
      sinkFirst(primary);
      p = fillBase(p, primary);
      if (opposite) {
        p = placeRole(p, 'drawer', opposite, 600);
        p = placeAt(p, 'range', opposite, wallLength(opposite) / 2, 600);
        p = fillBase(p, opposite);
        p = fillWallCabinets(p, opposite);
      }
      p = fillWallCabinets(p, primary);
      break;
    case 'l':
    case 'island':
      sinkFirst(primary);
      p = placeRole(p, 'fridge', primary, 700);
      p = fillBase(p, primary);
      p = placeAt(p, 'range', side, wallLength(side) / 2, 600);
      p = fillBase(p, side);
      p = fillWallCabinets(p, primary);
      p = fillWallCabinets(p, side);
      if (kind === 'island') p = addIsland(p, primary);
      break;
    case 'u':
      sinkFirst(primary);
      p = fillBase(p, primary);
      p = placeRole(p, 'fridge', prev, 700);
      p = fillBase(p, prev);
      p = placeAt(p, 'range', next, wallLength(next) / 2, 600);
      p = fillBase(p, next);
      for (const w of [primary, prev, next]) p = fillWallCabinets(p, w);
      break;
  }
  return dropErrors(p);
}

function addIsland(p: Project, primary: Wall): Project {
  const prod = productForRole(p.catalogId, 'island');
  if (!prod) return p;
  const n = inwardNormal(p, primary);
  const rotation = (Math.atan2(-n.x, n.y) * 180) / Math.PI + 180;
  const center = interiorPoint(p);
  const d = wallDir(primary);
  // The room centre is usually too close to the side run, so also try positions slid along the
  // primary wall (away from either side run) and towards or away from it, nearest first.
  const offsets: { s: number; t: number }[] = [];
  for (const s of [0, 300, -300, 600, -600, 900, -900]) for (const t of [0, 200, -200, 400]) offsets.push({ s, t });
  offsets.sort((a, b) => Math.abs(a.s) + Math.abs(a.t) - (Math.abs(b.s) + Math.abs(b.t)));
  const variants = [...prod.variants].sort((a, b) => b.width - a.width);
  const tryPlace = (acceptAisleWarning: boolean, vrs: typeof variants) => {
    for (const vr of vrs) {
      for (const { s, t } of offsets) {
        const c = { ...makeCabinet(prod, p, vr), rotation, anchor: { x: center.x + d.x * s + n.x * t, y: center.y + d.y * s + n.y * t, elevation: 0 } };
        const trial = withCabinet(p, c);
        const bad = validate(trial).some((w) => w.cabinetIds.includes(c.id) && (w.severity === 'error' || (!acceptAisleWarning && w.rule === 'OK-AISLE')));
        if (!bad) return trial;
      }
    }
    return null;
  };
  // Prefer a clean fit; in a tight room fall back to the smallest island with an aisle warning,
  // so choosing "L + island" never silently drops the island.
  return tryPlace(false, variants) ?? tryPlace(true, variants.slice(-1)) ?? p;
}

function dropErrors(p: Project): Project {
  for (let guard = 0; guard < 20; guard++) {
    const err = validate(p).find((w) => w.severity === 'error' && w.cabinetIds.length);
    if (!err) break;
    const drop = err.cabinetIds[err.cabinetIds.length - 1];
    p = { ...p, kitchen: { ...p.kitchen, cabinets: p.kitchen.cabinets.filter((c) => c.id !== drop) } };
  }
  return p;
}

export { place };
