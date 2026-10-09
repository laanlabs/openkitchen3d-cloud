// OpenPlan3D "prepared RoomPlan JSON" — the interchange contract in openkitchen3d-ios/docs/EXPORT_FORMAT.md.
// Export mirrors OpenPlanExporter.swift (metres, column-major 4×4, plan y → world Z) with the
// `openkitchen3d` block; import reads iOS exports (and our own) back into a web Project (mm).
import { add, alongWall, scale, sub, v, wallAngle, wallDir, wallLength, wallMid, wallPoint, interiorPoint, deg, rad } from '../model/geometry';
import type { CabinetFamily, Fixture, KitchenCabinetInstance, Opening, Project, Vec2, Wall } from '../model/types';
import { uid } from '../model/types';
import { catalogVersion, COUNTERTOP, defaultStyle, product } from '../catalog/catalog';

export const KITCHEN_SCHEMA = 'openkitchen3d/ios-project@0.1';
const m = (mm: number) => mm / 1000; // full precision, like the iOS exporter

export function transform(cx: number, cz: number, angle: number, y: number): number[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, cx, y, cz, 1];
}

/** Web-only settings carried in `openkitchen3d.web`. iOS stores this object verbatim and writes it back. */
export interface WebExtras {
  catalogId: Project['catalogId'];
  units: Project['units'];
  style: Project['kitchen']['style'];
  countertop: Project['kitchen']['countertop'];
  currency: string;
  /** Per-cabinet data iOS does not model, keyed by cabinet id. */
  cabinets: Record<string, { finishIds?: KitchenCabinetInstance['finishIds']; configuration?: KitchenCabinetInstance['configuration']; priceOverride?: number }>;
}

export function webExtras(p: Project): WebExtras {
  const cabinets: WebExtras['cabinets'] = {};
  for (const c of p.kitchen.cabinets) {
    const { front: _f, ...rest } = c.finishIds;
    const e: WebExtras['cabinets'][string] = {};
    if (Object.keys(rest).length) e.finishIds = rest;
    if (Object.keys(c.configuration).length) e.configuration = c.configuration;
    if (c.priceOverride != null) e.priceOverride = c.priceOverride;
    if (Object.keys(e).length) cabinets[c.id] = e;
  }
  return { catalogId: p.catalogId, units: p.units, style: p.kitchen.style, countertop: p.kitchen.countertop, currency: p.kitchen.currency, cabinets };
}

export function toOpenPlan(p: Project, opts: { embedWebProject?: boolean } = {}): Record<string, unknown> {
  const embed = opts.embedWebProject ?? true;
  const walls = p.walls.map((w) => {
    const mid = wallMid(w);
    return {
      identifier: w.id,
      dimensions: [m(wallLength(w)), m(w.height), m(w.thickness)],
      transform: transform(m(mid.x), m(mid.y), wallAngle(w), m(w.height / 2)),
      category: { wall: {} },
      story: 0
    };
  });
  const doors: unknown[] = [], windows: unknown[] = [], openings: unknown[] = [];
  for (const o of p.openings) {
    const w = p.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const c = wallPoint(w, o.position);
    const cy = o.kind === 'window' ? o.sillHeight + o.height / 2 : o.height / 2;
    const d: Record<string, unknown> = {
      identifier: o.id,
      parentIdentifier: w.id,
      dimensions: [m(o.width), m(o.height), m(w.thickness)],
      transform: transform(m(c.x), m(c.y), wallAngle(w), m(cy)),
      category: { [o.kind]: {} },
      story: 0
    };
    if (o.kind === 'door') { d.style = o.width > 1200 ? 'double' : 'single'; d.hingeLeft = o.hingeLeft ?? true; d.opensInward = true; doors.push(d); }
    else if (o.kind === 'window') { d.style = 'fixed'; d.sillHeight = m(o.sillHeight); windows.push(d); }
    else openings.push(d);
  }
  const objects: unknown[] = [];
  for (const f of p.fixtures)
    objects.push({
      identifier: f.id, dimensions: [m(f.width), m(f.height), m(f.depth)],
      transform: transform(m(f.center.x), m(f.center.y), rad(f.rotation), m(f.height / 2)),
      category: { [f.category]: {} }, attributes: { openkitchen3dRole: 'existing' }, story: 0
    });
  for (const c of p.kitchen.cabinets) {
    const prod = product(c.productId);
    objects.push({
      identifier: c.id, dimensions: [m(c.width), m(c.height), m(c.depth)],
      transform: transform(m(c.anchor.x), m(c.anchor.y), rad(c.rotation), m(c.anchor.elevation + c.height / 2)),
      category: { [prod?.openPlanCategory ?? 'base_cabinet']: {} },
      attributes: { openkitchen3dRole: 'proposed', sku: c.sku }, story: 0
    });
  }
  const interior = interiorPoint(p);
  return {
    openplanPrepared: true,
    openplanHandoffVersion: 1,
    version: 2,
    walls, doors, windows, openings, objects,
    sections: p.walls.length
      ? [{ center: [m(interior.x), 0, m(interior.y)], label: 'kitchen', story: 0, displayName: p.name, ceilingHeight: m(p.ceilingHeight) }]
      : [],
    stories: [{ index: 0, name: 'Ground Floor' }],
    floors: [],
    defaults: { ceilingHeight: m(p.ceilingHeight), interiorWallThickness: 0.12, exteriorWallThickness: 0.2 },
    planNotes: 'Created with OpenKitchen3D for web. Field-verify every dimension before ordering.',
    openkitchen3d: {
      schema: KITCHEN_SCHEMA,
      producer: 'web',
      units: 'm',
      projectId: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      catalogVersion: p.kitchen.catalogVersion,
      captureSource: p.captureSource,
      roomplanAdapterVersion: 1,
      verification: { ceilingHeight: p.ceilingVerified, walls: Object.fromEntries(p.walls.map((w) => [w.id, w.verified])) },
      cabinets: p.kitchen.cabinets.map((c) => ({
        id: c.id, productId: c.productId, sku: c.sku, family: c.family,
        width: m(c.width), depth: m(c.depth), height: m(c.height), elevation: m(c.anchor.elevation),
        finishId: c.finishIds.front ?? p.kitchen.style.front,
        ...(c.wallId ? { wallId: c.wallId } : {})
      })),
      // Additive, web-only. iOS keeps `web` verbatim; `webProject` is for web→web file round trips only.
      web: webExtras(p),
      ...(embed ? { webProject: p } : {})
    }
  };
}

type Json = Record<string, any>;

const pose = (t: number[]) => ({ x: t[12] * 1000, y: t[14] * 1000, angle: Math.atan2(t[2], t[0]), cy: t[13] * 1000 });
const catKey = (c: unknown) => (c && typeof c === 'object' ? Object.keys(c as object)[0] : String(c ?? 'object'));

export function isOpenPlanJson(j: unknown): j is Json {
  return !!j && typeof j === 'object' && Array.isArray((j as Json).walls) && ((j as Json).openplanHandoffVersion === 1 || 'objects' in (j as Json));
}
export const isWebProject = (j: unknown): j is Project => !!j && (j as Json).schema === 'openkitchen3d/web-project@0.1';

const iosFamily = (f: string): CabinetFamily => (['base', 'wall', 'tall', 'appliance', 'island', 'filler', 'panel'].includes(f) ? (f as CabinetFamily) : 'base');

/**
 * Reads an iOS / OpenPlan3D prepared RoomPlan JSON (or a web project) into a Project.
 * Throws an Error with a user-facing message when the file is damaged or not a kitchen.
 */
export function fromOpenPlan(j: Json, fallbackName = 'Imported kitchen'): Project {
  let p: Project;
  try {
    p = readOpenPlan(j, fallbackName);
  } catch {
    throw new Error('This file looks damaged: some walls, doors or cabinets could not be read.');
  }
  return checkProject(p);
}

const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const isVec = (q: unknown) => !!q && finite((q as Vec2).x) && finite((q as Vec2).y);

/**
 * Shape check for projects that arrive from outside (files, share and transfer links), so a damaged
 * or hand-edited file is rejected up front instead of being saved and breaking the editor later.
 */
export function checkProject(p: unknown): Project {
  const bad = (what: string): never => { throw new Error(`This kitchen can't be opened: ${what}.`); };
  if (!p || typeof p !== 'object') bad('it is empty');
  const q = p as Project;
  if (typeof q.id !== 'string' || !q.id) bad('it has no id');
  if (!Array.isArray(q.walls)) bad('it has no walls');
  for (const w of q.walls) {
    if (!w || typeof w.id !== 'string' || !isVec(w.start) || !isVec(w.end) || !finite(w.height) || !finite(w.thickness)) bad('a wall is incomplete');
    if (Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) < 1) bad('a wall has no length');
  }
  if (!Array.isArray(q.openings) || q.openings.some((o) => !o || !finite(o.position) || !finite(o.width) || !finite(o.height))) bad('a door or window is incomplete');
  if (!Array.isArray(q.fixtures)) bad('its fixtures are missing');
  if (!q.kitchen || !Array.isArray(q.kitchen.cabinets) || !q.kitchen.style || !q.kitchen.countertop) bad('its kitchen settings are missing');
  for (const c of q.kitchen.cabinets) {
    if (!c || typeof c.id !== 'string' || !c.anchor || !finite(c.anchor.x) || !finite(c.anchor.y) || !finite(c.anchor.elevation)
      || !finite(c.rotation) || !finite(c.width) || !finite(c.height) || !finite(c.depth)) bad('a cabinet is incomplete');
    c.configuration ??= {};
    c.finishIds ??= {};
  }
  if (!finite(q.ceilingHeight)) bad('the ceiling height is missing');
  if (typeof q.name !== 'string') q.name = 'Imported kitchen';
  return q;
}

function readOpenPlan(j: Json, fallbackName: string): Project {
  if (isWebProject(j)) return j;
  const block: Json | undefined = j.openkitchen3d;
  // The embedded web project is only trusted when the web wrote the file; anything iOS re-exports
  // is read from the shared block so its edits win.
  if (block?.producer === 'web' && isWebProject(block.webProject)) return block.webProject;
  const extras: Partial<WebExtras> = block?.web ?? {};
  const style = { ...defaultStyle, ...(extras.style ?? {}) };
  const verification = block?.verification ?? {};
  const walls: Wall[] = (j.walls ?? []).map((w: Json) => {
    const ps = pose(w.transform);
    const L = w.dimensions[0] * 1000;
    const d = v(Math.cos(ps.angle), Math.sin(ps.angle));
    const c = v(ps.x, ps.y);
    return {
      id: String(w.identifier ?? uid()),
      start: sub(c, scale(d, L / 2)),
      end: add(c, scale(d, L / 2)),
      height: (w.dimensions[1] ?? 2.4) * 1000,
      thickness: (w.dimensions[2] || 0.12) * 1000,
      verified: !!verification.walls?.[w.identifier]
    };
  });
  const openings: Opening[] = [];
  const readOpenings = (list: Json[] | undefined, kind: Opening['kind']) => {
    for (const o of list ?? []) {
      const ps = pose(o.transform);
      let wall = walls.find((w) => w.id === o.parentIdentifier);
      if (!wall) {
        // Nearest wall to the opening centre.
        wall = walls.slice().sort((a, b) => distToWall(a, ps) - distToWall(b, ps))[0];
      }
      if (!wall) continue;
      const height = o.dimensions[1] * 1000;
      const sill = kind === 'window' ? (o.sillHeight != null ? o.sillHeight * 1000 : ps.cy - height / 2) : 0;
      openings.push({
        id: String(o.identifier ?? uid()), wallId: wall.id, kind,
        position: Math.min(1, Math.max(0, alongWall(wall, ps) / wallLength(wall))),
        width: o.dimensions[0] * 1000, height, sillHeight: Math.max(0, sill), hingeLeft: o.hingeLeft ?? true
      });
    }
  };
  readOpenings(j.doors, 'door');
  readOpenings(j.windows, 'window');
  readOpenings(j.openings, 'opening');

  const cabinetMeta = new Map<string, Json>((block?.cabinets ?? []).map((c: Json) => [String(c.id), c]));
  const fixtures: Fixture[] = [];
  const cabinets: KitchenCabinetInstance[] = [];
  for (const o of j.objects ?? []) {
    const ps = pose(o.transform);
    const meta = cabinetMeta.get(String(o.identifier));
    const [w, h, d] = (o.dimensions as number[]).map((x) => x * 1000);
    if (meta) {
      const prod = product(meta.productId);
      cabinets.push({
        id: String(o.identifier),
        productId: prod ? prod.id : String(meta.productId),
        sku: meta.sku ?? o.attributes?.sku ?? '',
        family: prod?.family ?? iosFamily(meta.family),
        wallId: meta.wallId,
        anchor: { x: ps.x, y: ps.y, elevation: (meta.elevation ?? 0) * 1000 },
        rotation: deg(ps.angle),
        width: (meta.width ?? o.dimensions[0]) * 1000,
        height: (meta.height ?? o.dimensions[1]) * 1000,
        depth: (meta.depth ?? o.dimensions[2]) * 1000,
        configuration: { ...(extras.cabinets?.[String(o.identifier)]?.configuration ?? {}) },
        finishIds: {
          ...(extras.cabinets?.[String(o.identifier)]?.finishIds ?? {}),
          ...(meta.finishId && meta.finishId !== style.front ? { front: meta.finishId } : {})
        },
        ...(extras.cabinets?.[String(o.identifier)]?.priceOverride != null ? { priceOverride: extras.cabinets[String(o.identifier)].priceOverride } : {})
      });
    } else {
      fixtures.push({ id: String(o.identifier ?? uid()), category: catKey(o.category), center: v(ps.x, ps.y), rotation: deg(ps.angle), width: w, depth: d, height: h });
    }
  }
  const ceiling = (j.defaults?.ceilingHeight ?? j.sections?.[0]?.ceilingHeight ?? 2.4) * 1000;
  const now = new Date().toISOString();
  return {
    schema: 'openkitchen3d/web-project@0.1',
    id: String(block?.projectId ?? uid()),
    name: String(block?.name ?? j.sections?.[0]?.displayName ?? fallbackName),
    createdAt: block?.createdAt ?? now,
    // Keep the sender's edit time so the import screen can warn when the copy here is newer.
    updatedAt: typeof block?.updatedAt === 'string' ? block.updatedAt : now,
    catalogId: extras.catalogId ?? 'starter',
    units: extras.units ?? 'metric',
    captureSource: (block?.captureSource as Project['captureSource']) ?? 'lidar',
    ceilingHeight: ceiling,
    ceilingVerified: !!verification.ceilingHeight,
    walls,
    openings,
    fixtures,
    kitchen: {
      catalogVersion: extras.catalogId ? catalogVersion(extras.catalogId) : block?.catalogVersion ?? catalogVersion('starter'),
      cabinets,
      style,
      countertop: { ...COUNTERTOP, ...(extras.countertop ?? {}) },
      currency: extras.currency ?? 'USD'
    }
  };
}

function distToWall(w: Wall, p: { x: number; y: number }) {
  const s = Math.min(Math.max(alongWall(w, p), 0), wallLength(w));
  const q = add(w.start, scale(wallDir(w), s));
  return Math.hypot(q.x - p.x, q.y - p.y);
}

export function fileName(p: Project, suffix: string, ext: string) {
  const safe = p.name.split(/[^A-Za-z0-9]+/).filter(Boolean).join('-');
  return `${safe || 'kitchen'}-${suffix}.${ext}`;
}
