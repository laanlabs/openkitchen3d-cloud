// Placement and snapping rules — a port of openkitchen3d-ios Design/KitchenLayout.swift (metres → mm).
// Pure functions over Project so they are testable and identical across platforms.
import {
  add, alongWall, cabinetCenter, cabinetCorners, deg, dot, inwardNormal, interiorPoint,
  rectanglesOverlap, scale, sub, v, wallDir, wallLength, wallPoint
} from '../model/geometry';
import type { KitchenCabinetInstance, Project, Vec2, Wall } from '../model/types';
import { uid } from '../model/types';
import { defaultVariant, product as productById, variantFor, type Product, type Variant } from '../catalog/catalog';

/** Max distance from a wall's face for a dragged cabinet to snap to it. */
export const WALL_SNAP = 450;
/** Edge-to-edge distance within which neighbouring cabinets snap together. */
export const EDGE_SNAP = 80;

export function makeCabinet(p: Product, project: Project, variant: Variant = defaultVariant(p)): KitchenCabinetInstance {
  const elevation = Math.max(0, Math.min(p.elevation, project.ceilingHeight - variant.height));
  return {
    id: uid(),
    productId: p.id,
    sku: variant.sku,
    family: p.family,
    anchor: { x: 0, y: 0, elevation },
    rotation: 0,
    width: variant.width,
    height: variant.height,
    depth: variant.depth,
    configuration: variant.doors === 1 ? { hinge: 'left' } : {},
    finishIds: p.family === 'appliance' && p.fronts !== 'dishwasher' ? { front: 'stainless' } : {}
  };
}

/** Applies a catalog width: the variant's SKU, height and depth come with it. */
export function applyVariant(c: KitchenCabinetInstance, width: number): KitchenCabinetInstance {
  const p = productById(c.productId);
  if (!p) return { ...c, width };
  const vr = variantFor(p, width);
  return { ...c, width: vr.width, height: vr.height, depth: vr.depth, sku: vr.sku };
}

const wallById = (project: Project, id?: string) => project.walls.find((w) => w.id === id);

/** Places a new product: islands go mid-room, everything else into the first free slot along
 * `preferredWall` (or each wall, longest first). */
export function place(p: Product, project: Project, preferredWall?: string, variant?: Variant): KitchenCabinetInstance {
  const cabinet = makeCabinet(p, project, variant);
  if (p.family === 'island' || !project.walls.length) {
    return { ...cabinet, anchor: { ...cabinet.anchor, ...freeIslandSpot(cabinet, project) } };
  }
  const walls = [...project.walls].sort((a, b) => wallLength(b) - wallLength(a));
  const pi = walls.findIndex((w) => w.id === preferredWall);
  if (pi > 0) walls.unshift(walls.splice(pi, 1)[0]);
  for (const wall of walls) {
    const placed = firstFreeSlot(cabinet, wall, project);
    if (placed) return placed;
  }
  // Nothing free: put it at the start of the first wall and let validation flag it.
  return attach(cabinet, walls[0], cabinet.width / 2 + walls[0].thickness / 2, project);
}

function freeIslandSpot(c: KitchenCabinetInstance, project: Project): Vec2 {
  const base = interiorPoint(project);
  for (let step = 0; step < 16; step++) {
    const off = step * 250 * (step % 2 === 0 ? 1 : -1);
    const candidate = { ...c, anchor: { ...c.anchor, x: base.x, y: base.y + off } };
    if (!collides(candidate, project)) return v(candidate.anchor.x, candidate.anchor.y);
  }
  return base;
}

export function firstFreeSlot(c: KitchenCabinetInstance, wall: Wall, project: Project, from = -Infinity): KitchenCabinetInstance | null {
  const L = wallLength(wall);
  const lo = wall.thickness / 2 + c.width / 2;
  const hi = L - wall.thickness / 2 - c.width / 2;
  if (hi < lo) return null;
  // Candidate positions: run start, flush against every existing cabinet edge on this wall, then a 50 mm sweep.
  const candidates = [lo];
  for (const o of project.kitchen.cabinets) {
    if (o.wallId !== wall.id || o.id === c.id) continue;
    const s = alongWall(wall, cabinetCenter(o));
    candidates.push(s + o.width / 2 + c.width / 2, s - o.width / 2 - c.width / 2);
  }
  for (let s = lo; s <= hi + 1e-6; s += 50) candidates.push(s);
  candidates.push(hi);
  for (const s of candidates.sort((a, b) => a - b)) {
    if (s < lo - 1e-6 || s > hi + 1e-6 || s < from) continue;
    const placed = attach(c, wall, s, project);
    if (!collides(placed, project) && !blocksOpening(placed, wall, project)) return placed;
  }
  return null;
}

/** Positions `c` with its back on `wall`'s interior face, centred `s` mm along the wall. */
export function attach(c: KitchenCabinetInstance, wall: Wall, s: number, project: Project): KitchenCabinetInstance {
  const n = inwardNormal(project, wall);
  const center = add(add(wall.start, scale(wallDir(wall), s)), scale(n, wall.thickness / 2 + c.depth / 2));
  return {
    ...c,
    rotation: normDeg(deg(Math.atan2(-n.x, n.y))), // front normal == n
    anchor: { ...c.anchor, x: center.x, y: center.y },
    wallId: wall.id
  };
}

const normDeg = (d: number) => {
  const r = ((d % 360) + 360) % 360;
  return Math.abs(r - 360) < 1e-9 ? 0 : Math.round(r * 1e6) / 1e6;
};

/** Moves `c` toward plan point `p`, snapping to the nearest wall face and then to neighbours. */
export function drag(c: KitchenCabinetInstance, p: Vec2, project: Project, snap = true): KitchenCabinetInstance {
  if (snap && c.family !== 'island') {
    const hit = nearestWall(p, c.depth, project);
    if (hit) {
      const [wall, s] = hit;
      const lo = wall.thickness / 2 + c.width / 2;
      const hi = Math.max(lo, wallLength(wall) - wall.thickness / 2 - c.width / 2);
      const snapped = attach(c, wall, Math.min(Math.max(s, lo), hi), project);
      return snapToNeighbours(snapped, wall, project);
    }
  }
  const { wallId: _w, ...rest } = c;
  return { ...rest, anchor: { ...c.anchor, x: p.x, y: p.y } };
}

export function nearestWall(p: Vec2, depth: number, project: Project): [Wall, number] | null {
  let best: [Wall, number, number] | null = null;
  for (const wall of project.walls) {
    const L = wallLength(wall);
    if (L < 100) continue;
    const s = alongWall(wall, p);
    if (s < -200 || s > L + 200) continue;
    const n = inwardNormal(project, wall);
    // Distance from where the cabinet's centre would sit when attached.
    const offset = dot(sub(p, wall.start), n) - (wall.thickness / 2 + depth / 2);
    const d = Math.abs(offset);
    if (d < WALL_SNAP && d < (best?.[2] ?? Infinity)) best = [wall, s, d];
  }
  return best ? [best[0], best[1]] : null;
}

function snapToNeighbours(c: KitchenCabinetInstance, wall: Wall, project: Project): KitchenCabinetInstance {
  const s = alongWall(wall, cabinetCenter(c));
  let bestShift: number | null = null;
  for (const o of project.kitchen.cabinets) {
    if (o.wallId !== wall.id || o.id === c.id || !verticalOverlap(c, o)) continue;
    const os = alongWall(wall, cabinetCenter(o));
    for (const target of [os + o.width / 2 + c.width / 2, os - o.width / 2 - c.width / 2]) {
      const shift = target - s;
      if (Math.abs(shift) < EDGE_SNAP && Math.abs(shift) < Math.abs(bestShift ?? Infinity)) bestShift = shift;
    }
  }
  if (bestShift === null) return c;
  const moved = add(cabinetCenter(c), scale(wallDir(wall), bestShift));
  return { ...c, anchor: { ...c.anchor, x: moved.x, y: moved.y } };
}

/** Re-attaches a cabinet after its width/depth changed, keeping its left edge where it was. */
export function reflow(c: KitchenCabinetInstance, oldWidth: number, project: Project): KitchenCabinetInstance {
  const wall = wallById(project, c.wallId);
  if (!wall) return c;
  const s = alongWall(wall, cabinetCenter(c)) - oldWidth / 2 + c.width / 2;
  return attach(c, wall, s, project);
}

/** Re-attaches every wall cabinet after walls moved, keeping its distance along the wall. */
export function followWalls(before: Project, after: Project): Project {
  const cabinets = after.kitchen.cabinets.map((c) => {
    const oldWall = wallById(before, c.wallId);
    const newWall = wallById(after, c.wallId);
    if (!oldWall || !newWall) return c;
    const s = alongWall(oldWall, cabinetCenter(c));
    return attach(c, newWall, Math.min(s, wallLength(newWall) - newWall.thickness / 2 - c.width / 2), after);
  });
  return { ...after, kitchen: { ...after.kitchen, cabinets } };
}

export function verticalOverlap(a: KitchenCabinetInstance, b: KitchenCabinetInstance): boolean {
  return a.anchor.elevation < b.anchor.elevation + b.height - 1 && b.anchor.elevation < a.anchor.elevation + a.height - 1;
}

export function collides(c: KitchenCabinetInstance, project: Project): boolean {
  return project.kitchen.cabinets.some(
    (o) => o.id !== c.id && verticalOverlap(o, c) && rectanglesOverlap(cabinetCorners(o), cabinetCorners(c))
  );
}

export function blocksOpening(c: KitchenCabinetInstance, wall: Wall, project: Project): boolean {
  const s = alongWall(wall, cabinetCenter(c));
  const lo = s - c.width / 2, hi = s + c.width / 2;
  const L = wallLength(wall);
  for (const o of project.openings) {
    if (o.wallId !== wall.id) continue;
    const mid = o.position * L;
    if (!(lo < mid + o.width / 2 - 1 && hi > mid - o.width / 2 + 1)) continue;
    const bottom = o.kind === 'window' ? o.sillHeight : 0;
    const top = bottom + o.height;
    if (c.anchor.elevation < top && c.anchor.elevation + c.height > bottom) return true;
  }
  return false;
}

/** Distance along a wall and the cabinet's span on it. */
export function spanOnWall(c: KitchenCabinetInstance, wall: Wall): { s: number; lo: number; hi: number } {
  const s = alongWall(wall, cabinetCenter(c));
  return { s, lo: s - c.width / 2, hi: s + c.width / 2 };
}

export { wallPoint };
