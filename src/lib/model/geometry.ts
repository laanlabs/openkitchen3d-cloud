import type { KitchenCabinetInstance, Project, Vec2, Wall } from './types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
};
/** Rotated +90°. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const deg = (rad: number): number => (rad * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;

export const wallVector = (w: Wall): Vec2 => sub(w.end, w.start);
export const wallLength = (w: Wall): number => len(wallVector(w));
export const wallDir = (w: Wall): Vec2 => norm(wallVector(w));
export const wallAngle = (w: Wall): number => Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
export const wallPoint = (w: Wall, t: number): Vec2 => add(w.start, scale(wallVector(w), t));
export const wallMid = (w: Wall): Vec2 => wallPoint(w, 0.5);

/** Centroid of the room polygon when walls close, else of wall midpoints — "inside" for convex-ish kitchens. */
export function interiorPoint(p: Project): Vec2 {
  const poly = roomPolygon(p);
  if (poly) return polygonCentroid(poly);
  if (!p.walls.length) return v(0, 0);
  const s = p.walls.reduce((acc, w) => add(acc, wallMid(w)), v(0, 0));
  return scale(s, 1 / p.walls.length);
}

/** Unit normal of `wall` pointing into the room. */
export function inwardNormal(p: Project, wall: Wall): Vec2 {
  const n = perp(wallDir(wall));
  const poly = roomPolygon(p);
  if (poly) {
    // Probe just inside each side of the wall midpoint: robust for L/U rooms where the centroid misleads.
    const probe = add(wallMid(wall), scale(n, wall.thickness / 2 + 50));
    return pointInPolygon(poly, probe) ? n : scale(n, -1);
  }
  return dot(sub(interiorPoint(p), wallMid(wall)), n) >= 0 ? n : scale(n, -1);
}

export function cabinetAxis(c: KitchenCabinetInstance): Vec2 {
  const r = rad(c.rotation);
  return v(Math.cos(r), Math.sin(r));
}
export const cabinetFront = (c: KitchenCabinetInstance): Vec2 => perp(cabinetAxis(c));
export const cabinetCenter = (c: KitchenCabinetInstance): Vec2 => v(c.anchor.x, c.anchor.y);

/** Plan footprint corners: back-left, back-right, front-right, front-left. */
export function footprint(center: Vec2, rotationDeg: number, width: number, depth: number): Vec2[] {
  const r = rad(rotationDeg);
  const a = scale(v(Math.cos(r), Math.sin(r)), width / 2);
  const n = scale(perp(v(Math.cos(r), Math.sin(r))), depth / 2);
  return [sub(sub(center, a), n), sub(add(center, a), n), add(add(center, a), n), add(sub(center, a), n)];
}
export const cabinetCorners = (c: KitchenCabinetInstance): Vec2[] =>
  footprint(cabinetCenter(c), c.rotation, c.width, c.depth);

/** Separating-axis test for two convex quads; touching edges do not count. */
export function rectanglesOverlap(a: Vec2[], b: Vec2[], tolerance = 2): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const axis = norm(perp(sub(poly[(i + 1) % poly.length], poly[i])));
      const pa = a.map((p) => dot(p, axis));
      const pb = b.map((p) => dot(p, axis));
      if (Math.max(...pa) <= Math.min(...pb) + tolerance || Math.max(...pb) <= Math.min(...pa) + tolerance) return false;
    }
  }
  return true;
}

export function polygonDistance(a: Vec2[], b: Vec2[]): number {
  if (rectanglesOverlap(a, b, 0)) return 0;
  const ps = (p: Vec2, s0: Vec2, s1: Vec2) => {
    const d = sub(s1, s0);
    const l2 = dot(d, d);
    const t = l2 > 0 ? Math.min(Math.max(dot(sub(p, s0), d) / l2, 0), 1) : 0;
    return dist(p, add(s0, scale(d, t)));
  };
  let best = Infinity;
  for (const [pts, poly] of [[a, b], [b, a]] as const)
    for (const q of pts) for (let i = 0; i < poly.length; i++) best = Math.min(best, ps(q, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/** Ordered polygon (wall centre-lines) when the walls form one closed chain. */
export function roomPolygon(p: Project): Vec2[] | null {
  if (p.walls.length < 3) return null;
  const tol = 50;
  const remaining = p.walls.map((w) => ({ start: w.start, end: w.end }));
  const chain = [remaining.shift()!];
  while (remaining.length) {
    const tail = chain[chain.length - 1].end;
    const i = remaining.findIndex((w) => dist(w.start, tail) < tol || dist(w.end, tail) < tol);
    if (i < 0) return null;
    let next = remaining.splice(i, 1)[0];
    if (dist(next.end, tail) < tol) next = { start: next.end, end: next.start };
    chain.push(next);
  }
  if (dist(chain[chain.length - 1].end, chain[0].start) >= tol) return null;
  return chain.map((w) => w.start);
}

export function pointInPolygon(poly: Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  const A = polygonArea(poly);
  if (Math.abs(A) < 1e-6) return scale(poly.reduce(add, v(0, 0)), 1 / poly.length);
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return v(cx / (6 * A), cy / (6 * A));
}

/** Inner face polygon: each wall offset inward by half its thickness (for floor area and 3D floor). */
export function innerPolygon(p: Project): Vec2[] | null {
  const poly = roomPolygon(p);
  if (!poly) return null;
  const t = (p.walls[0]?.thickness ?? 120) / 2;
  const ccw = polygonArea(poly) > 0;
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const d = norm(sub(b, a));
    const inward = ccw ? perp(d) : scale(perp(d), -1);
    return { p: add(a, scale(inward, t)), d };
  });
  return lines.map((l, i) => {
    const prev = lines[(i - 1 + n) % n];
    const denom = prev.d.x * l.d.y - prev.d.y * l.d.x;
    if (Math.abs(denom) < 1e-9) return l.p;
    const w = sub(l.p, prev.p);
    const s = (w.x * l.d.y - w.y * l.d.x) / denom;
    return add(prev.p, scale(prev.d, s));
  });
}

export function projectBounds(p: Project): { min: Vec2; max: Vec2 } {
  let pts = [...p.walls.flatMap((w) => [w.start, w.end]), ...p.kitchen.cabinets.flatMap(cabinetCorners)];
  if (!pts.length) pts = [v(0, 0), v(4000, 3000)];
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { min: v(Math.min(...xs), Math.min(...ys)), max: v(Math.max(...xs), Math.max(...ys)) };
}

/** Distance along the wall of a plan point, from the wall start. */
export const alongWall = (w: Wall, p: Vec2): number => dot(sub(p, w.start), wallDir(w));
