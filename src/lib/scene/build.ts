// Procedural three.js model of a project. Metres in the scene (mm / 1000), Y-up; plan x → X, plan y → Z.
// Cabinets are generated from parameters — never stretched meshes — so door gaps and handle sizes stay
// constant at any width (handoff change #4).
import * as THREE from 'three';
import type { FinishIds, KitchenCabinetInstance, Opening, Project, Wall, Fixture } from '../model/types';
import { innerPolygon, roomPolygon, wallAngle, wallLength, wallMid, rad } from '../model/geometry';
import { carcasses, countertops, fronts as frontSwatches, handles, product, swatch, TOE_KICK, variantFor, type FrontKind } from '../catalog/catalog';
import type { GeneratedPart } from '../layout/runs';

const M = 0.001;
const REVEAL = 0.002;
const FRONT_T = 0.018;

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(hex: string, roughness = 0.6, metalness = 0, opacity = 1): THREE.MeshStandardMaterial {
  const key = `${hex}|${roughness}|${metalness}|${opacity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, metalness, transparent: opacity < 1, opacity });
    if (opacity < 1) m.depthWrite = false;
    matCache.set(key, m);
  }
  return m;
}

const boxGeoCache = new Map<string, THREE.BoxGeometry>();
function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`;
  let g = boxGeoCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4)); boxGeoCache.set(key, g); }
  const mesh = new THREE.Mesh(g, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface Resolved { front: string; carcass: string; handle: string; countertop: string }
export const resolveFinish = (c: KitchenCabinetInstance, style: FinishIds): Resolved => ({ ...style, ...c.finishIds });

// ---------------- room ----------------

export function buildFloor(p: Project): THREE.Object3D | null {
  const poly = innerPolygon(p) ?? roomPolygon(p);
  if (!poly) return null;
  const shape = new THREE.Shape(poly.map((q) => new THREE.Vector2(q.x * M, q.y * M)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: '#d8c8b0', roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'floor';
  return mesh;
}

export function buildWall(w: Wall, openings: Opening[]): THREE.Group {
  const g = new THREE.Group();
  const L = wallLength(w) * M, H = w.height * M, T = w.thickness * M;
  const m = mat('#f3f1ec', 0.92);
  const glass = mat('#9fd3e6', 0.05, 0.1, 0.35);
  const frame = mat('#ffffff', 0.5);
  const cuts = openings
    .map((o) => {
      const c = o.position * L;
      const bottom = o.kind === 'window' ? o.sillHeight * M : 0;
      return { lo: c - (o.width * M) / 2, hi: c + (o.width * M) / 2, bottom, top: Math.min(bottom + o.height * M, H), o };
    })
    .sort((a, b) => a.lo - b.lo);
  const piece = (lo: number, hi: number, y0: number, y1: number, material: THREE.Material, depth = T) => {
    if (hi - lo < 0.004 || y1 - y0 < 0.004) return;
    const b = box(hi - lo, y1 - y0, depth, material, (lo + hi) / 2 - L / 2, (y0 + y1) / 2, 0);
    if (material === glass) { b.castShadow = false; }
    g.add(b);
  };
  let cursor = 0;
  for (const c of cuts) {
    piece(cursor, Math.max(cursor, c.lo), 0, H, m);
    piece(c.lo, c.hi, 0, c.bottom, m);
    piece(c.lo, c.hi, c.top, H, m);
    if (c.o.kind === 'window') {
      piece(c.lo, c.hi, c.bottom + 0.02, c.top - 0.02, glass, 0.01);
      // frame
      piece(c.lo, c.hi, c.bottom, c.bottom + 0.04, frame, T + 0.02);
      piece(c.lo, c.lo + 0.04, c.bottom, c.top, frame, T * 0.6);
      piece(c.hi - 0.04, c.hi, c.bottom, c.top, frame, T * 0.6);
      piece(c.lo, c.hi, c.top - 0.04, c.top, frame, T * 0.6);
    } else if (c.o.kind === 'door') {
      piece(c.lo - 0.04, c.lo, 0, c.top + 0.04, frame, T + 0.02);
      piece(c.hi, c.hi + 0.04, 0, c.top + 0.04, frame, T + 0.02);
      piece(c.lo - 0.04, c.hi + 0.04, c.top, c.top + 0.04, frame, T + 0.02);
    }
    cursor = Math.max(cursor, c.hi);
  }
  piece(cursor, L, 0, H, m);
  const mid = wallMid(w);
  g.position.set(mid.x * M, 0, mid.y * M);
  g.rotation.y = -wallAngle(w);
  g.userData = { wallId: w.id };
  return g;
}

export function buildFixture(f: Fixture): THREE.Object3D {
  const b = box(f.width * M, f.height * M, f.depth * M, mat('#f59e0b', 1, 0, 0.25), 0, (f.height * M) / 2, 0);
  b.castShadow = false;
  const g = new THREE.Group();
  g.add(b);
  g.position.set(f.center.x * M, 0, f.center.y * M);
  g.rotation.y = -rad(f.rotation);
  g.userData = { fixtureId: f.id };
  return g;
}

// ---------------- cabinets ----------------

export interface Front { x: number; y: number; w: number; h: number; kind: 'door' | 'drawer' | 'fixed' | 'glass'; hinge?: 'left' | 'right' | 'top' }

export function frontLayout(kind: FrontKind, doors: number, drawers: number, w: number, h: number, wallUnit: boolean, hinge: 'left' | 'right'): Front[] {
  const col = (n: number, y: number, fh: number, k: Front['kind'] = 'door'): Front[] =>
    n <= 1
      ? [{ x: 0, y, w, h: fh, kind: k, hinge }]
      : [{ x: -w / 4, y, w: w / 2, h: fh, kind: k, hinge: 'left' }, { x: w / 4, y, w: w / 2, h: fh, kind: k, hinge: 'right' }];
  switch (kind) {
    case 'drawers': {
      const n = Math.max(2, drawers || 3);
      const parts = n === 3 ? [0.25, 0.35, 0.4] : Array(n).fill(1 / n);
      let y = h;
      return parts.map((f) => { const fh = h * f; y -= fh; return { x: 0, y: y + fh / 2, w, h: fh, kind: 'drawer' as const }; });
    }
    case 'sink': {
      const strip = Math.min(0.16, h * 0.2);
      return [{ x: 0, y: h - strip / 2, w, h: strip, kind: 'fixed' }, ...col(w >= 0.55 ? 2 : 1, (h - strip) / 2, h - strip)];
    }
    case 'doors': {
      if (doors >= 4) {
        const top = h * 0.36;
        return [...col(2, h - top / 2, top), ...col(2, (h - top) / 2, h - top)];
      }
      if (drawers > 0 && !wallUnit) {
        const strip = Math.min(0.16, h * 0.2);
        return [{ x: 0, y: h - strip / 2, w, h: strip, kind: 'drawer' }, ...col(doors || (w >= 0.55 ? 2 : 1), (h - strip) / 2, h - strip)];
      }
      if (h > 1.5) {
        // tall: split into upper and lower doors
        const top = h * 0.42;
        const n = doors >= 2 && w >= 0.55 ? 2 : 1;
        return [...col(n, h - top / 2, top), ...col(n, (h - top) / 2, h - top)];
      }
      return col(doors || (w >= 0.55 ? 2 : 1), h / 2, h);
    }
    case 'dishwasher':
      return [{ x: 0, y: h / 2, w, h, kind: 'door', hinge: 'top' }];
    case 'fridge': {
      const bottom = h * 0.36;
      if (w >= 0.8) return [...col(2, h - (h - bottom) / 2, h - bottom), { x: 0, y: bottom / 2, w, h: bottom, kind: 'drawer' }];
      return [{ x: 0, y: h - (h - bottom) / 2, w, h: h - bottom, kind: 'door', hinge }, { x: 0, y: bottom / 2, w, h: bottom, kind: 'door', hinge }];
    }
    case 'oven': {
      const ovenTop = Math.min(h, 1.62), ovenBottom = Math.min(h, 0.9);
      const out: Front[] = [];
      if (h > ovenTop + 0.05) out.push({ x: 0, y: (h + ovenTop) / 2, w, h: h - ovenTop, kind: 'door', hinge });
      out.push({ x: 0, y: (ovenTop + ovenBottom) / 2, w, h: ovenTop - ovenBottom, kind: 'glass' });
      out.push({ x: 0, y: ovenBottom * 0.75, w, h: ovenBottom * 0.5, kind: 'drawer' }, { x: 0, y: ovenBottom * 0.25, w, h: ovenBottom * 0.5, kind: 'drawer' });
      return out;
    }
    case 'filler': case 'panel':
      return [{ x: 0, y: h / 2, w, h, kind: 'fixed' }];
    case 'beverage':
      return [{ x: 0, y: h / 2, w, h, kind: 'glass' }];
    default:
      return [];
  }
}

export interface CabinetOptions { ceiling: number; open: boolean; selected?: boolean }

export function buildCabinet(c: KitchenCabinetInstance, style: FinishIds, opts: CabinetOptions): THREE.Group {
  const g = new THREE.Group();
  const prod = product(c.productId);
  const kind: FrontKind = prod?.fronts ?? 'doors';
  const vr = prod ? variantFor(prod, c.width) : undefined;
  const fin = resolveFinish(c, style);
  const frontSw = swatch(frontSwatches, fin.front);
  const carcassSw = swatch(carcasses, fin.carcass);
  const handleSw = swatch(handles, fin.handle);
  const frontMat = mat(frontSw.hex, frontSw.roughness ?? 0.55, frontSw.metalness ?? 0);
  const carcassMat = mat(c.family === 'appliance' ? frontSw.hex : carcassSw.hex, c.family === 'appliance' ? frontSw.roughness ?? 0.4 : 0.7, c.family === 'appliance' ? frontSw.metalness ?? 0 : 0);
  const dark = mat('#1d1f22', 0.35, 0.2);
  const glass = mat('#20262c', 0.05, 0.6, 0.85);
  const handleMat = mat(handleSw.hex, handleSw.roughness ?? 0.3, handleSw.metalness ?? 1);

  const W = c.width * M, H = c.height * M, D = c.depth * M;
  const wallUnit = c.anchor.elevation >= 500;
  const onFloor = c.anchor.elevation < 50 && !wallUnit;
  const kick = onFloor && c.family !== 'appliance' && kind !== 'panel' ? TOE_KICK * M : 0;
  const carcassH = H - kick;

  if (kind === 'hood') {
    const canopyH = Math.min(0.12, H * 0.3);
    g.add(box(W, canopyH, D, carcassMat, 0, canopyH / 2, 0));
    const taperH = H - canopyH;
    const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, Math.min(W, D) * 0.55, taperH, 4, 1), carcassMat);
    taper.rotation.y = Math.PI / 4;
    taper.scale.set(W / Math.min(W, D), 1, D / Math.min(W, D) * 0.9);
    taper.position.set(0, canopyH + taperH / 2, -D * 0.05);
    taper.castShadow = true;
    g.add(taper);
    const chimneyH = Math.max(0, opts.ceiling * M - c.anchor.elevation * M - H);
    if (chimneyH > 0.01) g.add(box(0.26, chimneyH, 0.24, carcassMat, 0, H + chimneyH / 2, -D / 2 + 0.14));
    g.add(box(W * 0.8, 0.004, D * 0.7, dark, 0, -0.001, 0));
  } else if (kind === 'open') {
    const t = 0.018;
    g.add(box(t, H, D, frontMat, -W / 2 + t / 2, H / 2, 0), box(t, H, D, frontMat, W / 2 - t / 2, H / 2, 0));
    g.add(box(W, t, D, frontMat, 0, t / 2, 0), box(W, t, D, frontMat, 0, H - t / 2, 0), box(W - 2 * t, t, D - 0.02, frontMat, 0, H / 2, 0));
    g.add(box(W - 2 * t, H - 2 * t, 0.006, carcassMat, 0, H / 2, -D / 2 + 0.003));
  } else {
    if (kick > 0) g.add(box(W, kick, D - 0.07, mat('#2a2b2e', 0.8), 0, kick / 2, -0.035));
    g.add(box(W, carcassH, D - FRONT_T - 0.002, carcassMat, 0, kick + carcassH / 2, -(FRONT_T + 0.002) / 2));
    const frontZ = D / 2 - FRONT_T / 2;
    const hinge = (c.configuration.hinge as 'left' | 'right') ?? 'left';
    const fronts = frontLayout(kind, vr?.doors ?? 0, vr?.drawers ?? 0, W, carcassH, wallUnit, hinge);
    for (const f of fronts) {
      const fw = f.w - REVEAL * 2, fh = f.h - REVEAL * 2;
      const pivot = new THREE.Group();
      const material = f.kind === 'glass' ? glass : frontMat;
      const panel = box(fw, fh, FRONT_T, material);
      let handle: THREE.Object3D | null = null;
      const isAppliance = c.family === 'appliance' || kind === 'oven';
      const wantsHandle = f.kind === 'door' || f.kind === 'drawer' || (f.kind === 'glass' && kind === 'beverage');
      if (wantsHandle && (fin.handle !== 'none' || isAppliance)) {
        const vertical = f.kind === 'door' && f.hinge !== 'top' && (fh > 0.45 || kind === 'fridge');
        const hm = isAppliance ? mat('#c9ccd0', 0.25, 1) : handleMat;
        if (fin.handle === 'knob-brass' && !isAppliance) {
          const k = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 16), hm);
          k.rotation.x = Math.PI / 2;
          handle = k;
        } else if (vertical) {
          handle = box(0.012, Math.min(isAppliance ? 0.6 : 0.16, fh * 0.6), 0.025, hm);
        } else {
          handle = box(Math.min(isAppliance ? fw * 0.8 : 0.16, fw * 0.6), 0.012, 0.025, hm);
        }
        // position on the panel
        let hx = 0, hy = 0;
        if (f.kind === 'door' && f.hinge !== 'top') {
          hx = (f.hinge === 'left' ? 1 : -1) * (fw / 2 - 0.04);
          hy = kind === 'fridge' ? (f.y > carcassH / 2 ? -fh / 2 + 0.35 : fh / 2 - 0.3) : wallUnit ? -fh / 2 + 0.07 : fh > 1.2 ? 0 : fh / 2 - 0.08;
          if (fin.handle === 'knob-brass' && !isAppliance) hy = wallUnit ? -fh / 2 + 0.05 : fh / 2 - 0.05;
        } else {
          hy = f.kind === 'drawer' || f.hinge === 'top' ? fh / 2 - Math.min(0.05, fh * 0.3) : 0;
        }
        handle.position.set(hx, hy, FRONT_T / 2 + 0.015);
        handle.castShadow = true;
      }
      // Pivot at hinge edge for door-opening animation.
      const content = new THREE.Group();
      content.add(panel);
      if (handle) content.add(handle);
      if (f.kind === 'door' && f.hinge !== 'top') {
        const edge = f.hinge === 'right' ? fw / 2 : -fw / 2;
        pivot.position.set(f.x + edge, kick + f.y, frontZ);
        content.position.set(-edge, 0, 0);
        if (opts.open) pivot.rotation.y = (f.hinge === 'right' ? 1 : -1) * rad(-75);
      } else if (f.hinge === 'top' && f.kind === 'door') {
        // dishwasher drops down
        pivot.position.set(f.x, kick + f.y - fh / 2, frontZ);
        content.position.set(0, fh / 2, 0);
        if (opts.open) pivot.rotation.x = rad(80);
      } else {
        pivot.position.set(f.x, kick + f.y, frontZ + (opts.open && f.kind === 'drawer' ? Math.min(0.35, D * 0.6) : 0));
      }
      pivot.add(content);
      g.add(pivot);
    }
    applianceDetail(g, c, kind, { W, H, D, kick, dark, glass });
  }

  if (opts.selected) {
    const helper = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.01, H + 0.01, D + 0.01)),
      new THREE.LineBasicMaterial({ color: '#0e7c86', linewidth: 2 })
    );
    helper.position.y = H / 2;
    g.add(helper);
  }

  g.position.set(c.anchor.x * M, c.anchor.elevation * M, c.anchor.y * M);
  g.rotation.y = -rad(c.rotation);
  g.userData = { cabinetId: c.id };
  g.traverse((o) => { o.userData.cabinetId = c.id; });
  return g;
}

function applianceDetail(
  g: THREE.Group, c: KitchenCabinetInstance, kind: FrontKind,
  d: { W: number; H: number; D: number; kick: number; dark: THREE.Material; glass: THREE.Material }
) {
  const { W, H, D, dark, glass } = d;
  const fz = D / 2 + 0.001;
  switch (kind) {
    case 'range': {
      g.add(box(W, 0.012, D, dark, 0, H + 0.006, 0));
      const ring = new THREE.TorusGeometry(0.075, 0.008, 6, 24);
      const burnerMat = mat('#3c3f44', 0.4, 0.6);
      const nx = W > 0.8 ? 3 : 2;
      for (let i = 0; i < nx; i++) for (let j = 0; j < 2; j++) {
        const r = new THREE.Mesh(ring, burnerMat);
        r.rotation.x = Math.PI / 2;
        r.position.set((i - (nx - 1) / 2) * (W / nx), H + 0.014, (j - 0.5) * D * 0.45);
        g.add(r);
      }
      g.add(box(W * 0.75, H * 0.32, 0.01, glass, 0, H * 0.45, fz));
      g.add(box(W - 0.01, 0.09, 0.03, mat('#2b2d31', 0.4, 0.4), 0, H - 0.06, fz - 0.005));
      break;
    }
    case 'sink': {
      if (c.family !== 'island' && c.family !== 'base') break;
      const top = H + 0.04;
      const bw = Math.min(0.7, W - 0.2), bd = Math.min(0.42, D - 0.16);
      g.add(box(bw, 0.004, bd, mat('#9aa0a6', 0.2, 0.9), 0, top + 0.002, 0.01));
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.3, 12), mat('#c9ccd0', 0.2, 1));
      tap.position.set(0, top + 0.15, -bd / 2 - 0.04);
      g.add(tap);
      const spout = box(0.02, 0.02, 0.18, mat('#c9ccd0', 0.2, 1), 0, top + 0.29, -bd / 2 + 0.04);
      g.add(spout);
      break;
    }
    case 'dishwasher':
      g.add(box(W - 0.01, 0.06, 0.004, mat('#2b2d31', 0.4, 0.4), 0, H - 0.05, fz + 0.01));
      break;
    case 'microwave':
      g.add(box(W * 0.62, H * 0.6, 0.006, glass, -W * 0.12, H / 2, fz + 0.01));
      break;
  }
}

// ---------------- generated parts ----------------

export function buildPart(part: GeneratedPart, style: FinishIds): THREE.Object3D {
  let m: THREE.Material;
  if (part.kind === 'countertop') {
    const s = swatch(countertops, part.finish ?? style.countertop);
    m = mat(s.hex, s.roughness ?? 0.4, 0);
  } else {
    const s = swatch(frontSwatches, style.front);
    m = mat(s.hex, s.roughness ?? 0.55, s.metalness ?? 0);
  }
  const W = part.width * M, H = part.height * M, D = part.depth * M;
  const b = box(W, H, D, m, 0, H / 2, 0);
  const g = new THREE.Group();
  g.add(b);
  g.position.set(part.center.x * M, part.elevation * M, part.center.y * M);
  g.rotation.y = -rad(part.rotation);
  g.userData = { partId: part.id };
  return g;
}

/** Stable hash of everything that affects a cabinet's geometry, for per-object scene updates. */
export const cabinetHash = (c: KitchenCabinetInstance, style: FinishIds, opts: CabinetOptions) =>
  JSON.stringify([c, resolveFinish(c, style), opts.ceiling, opts.open, !!opts.selected]);
