// Web ⇄ iOS interop. Shared fixtures live in both repos:
//   tests/fixtures/ios/*.openplan3d.json   written by openkitchen3d-ios (ExportContractTests / InteropTests)
//   tests/fixtures/ios/*.expected.json     what iOS computed for them (cabinets + design-check results)
//   ../openkitchen3d-ios/OpenKitchen3DTests/Fixtures/web/   written by this file when OK3D_WEB_FIXTURE_OUT is set
// Regenerate both sides with openkitchen3d-ios/scripts/verify-web-interop.sh.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromOpenPlan, toOpenPlan } from '../src/lib/io/openplan';
import { decodePayload, encodePayload, iosImportUrl, transferJson, webImportUrl } from '../src/lib/io/transfer';
import { validate } from '../src/lib/layout/validation';
import { attach, makeCabinet } from '../src/lib/layout/layout';
import { defaultRoom, newProject, propose } from '../src/lib/layout/templates';
import { product, stylePresets } from '../src/lib/catalog/catalog';
import { uid, type Project } from '../src/lib/model/types';
import { wallLength } from '../src/lib/model/geometry';

/** Rules both platforms implement (web adds OK-SWING and OK-CEILING). */
const SHARED_RULES = new Set(['OK-COLLIDE', 'OK-DOOR', 'OK-WINDOW', 'OK-OUTSIDE', 'OK-AISLE', 'OK-UNVERIFIED']);

export interface Expected {
  name: string;
  cabinets: { id: string; productId: string; sku: string; wallId: string | null; elevation: number; width: number }[];
  rules: string[];
}

export function summarize(p: Project): Expected {
  return {
    name: p.name,
    cabinets: p.kitchen.cabinets
      .map((c) => ({ id: c.id, productId: c.productId, sku: c.sku, wallId: c.wallId ?? null, elevation: Math.round(c.anchor.elevation), width: Math.round(c.width) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    rules: [...new Set(validate(p).filter((w) => SHARED_RULES.has(w.rule)).map((w) => `${w.rule}|${[...w.cabinetIds].sort().join(',')}`))].sort()
  };
}

const IOS_DIR = join(__dirname, 'fixtures/ios');
const fixtures = existsSync(IOS_DIR) ? readdirSync(IOS_DIR).filter((f) => f.endsWith('.openplan3d.json')) : [];

describe('transfer links', () => {
  it('round-trips a kitchen through the deflate-raw base64url payload', async () => {
    const p = propose(newProject({ name: 'Link', room: defaultRoom('l'), catalogId: 'na', units: 'imperial' }), 'u');
    const j = transferJson(p);
    const payload = await encodePayload(j);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePayload(payload)).toEqual(JSON.parse(JSON.stringify(j)));
    expect(await webImportUrl(p)).toMatch(/^https:\/\/openkitchen3d-cloud\.web\.app\/#\/import\/v1\/[A-Za-z0-9_-]+$/);
    expect(await iosImportUrl(p)).toMatch(/^openkitchen3d:\/\/import\/v1\//);
    expect((j.openkitchen3d as Record<string, unknown>).webProject).toBeUndefined();
  });

  it('decodes a payload produced by iOS (Apple COMPRESSION_ZLIB = raw deflate)', async () => {
    const file = join(IOS_DIR, 'payload.txt');
    if (!existsSync(file)) return;
    const [payload] = readFileSync(file, 'utf8').trim().split('\n');
    const j = (await decodePayload(payload)) as Record<string, any>;
    expect(j.openplanHandoffVersion).toBe(1);
    expect(j.openkitchen3d.producer).toBe('ios');
  });
});

describe('iOS exports open in the web planner', () => {
  it('has iOS fixtures', () => expect(fixtures.length).toBeGreaterThan(0));
  for (const f of fixtures) {
    it(`${f}: same cabinets and design checks as iOS`, () => {
      const j = JSON.parse(readFileSync(join(IOS_DIR, f), 'utf8'));
      const expected: Expected = JSON.parse(readFileSync(join(IOS_DIR, f.replace('.openplan3d.json', '.expected.json')), 'utf8'));
      const p = fromOpenPlan(j);
      const got = summarize(p);
      expect(got.cabinets).toEqual(expected.cabinets);
      expect(got.rules).toEqual(expected.rules);
    });
  }
});

describe('web → iOS → web keeps web-only data', () => {
  const trips = fixtures.filter((f) => f.startsWith('roundtrip-'));
  if (!trips.length) it.skip('no round-trip fixtures from iOS yet', () => {});
  for (const f of trips) {
    it(f, () => {
      const original: Project = JSON.parse(readFileSync(join(__dirname, 'fixtures/web-source', f.replace('roundtrip-', '').replace('.openplan3d.json', '.project.json')), 'utf8'));
      const back = fromOpenPlan(JSON.parse(readFileSync(join(IOS_DIR, f), 'utf8')));
      expect(back.id).toBe(original.id);
      expect(back.catalogId).toBe(original.catalogId);
      expect(back.units).toBe(original.units);
      expect(back.kitchen.style).toEqual(original.kitchen.style);
      expect(back.kitchen.countertop).toEqual(original.kitchen.countertop);
      expect(back.walls.map((w) => w.verified)).toEqual(original.walls.map((w) => w.verified));
      const byId = new Map(original.kitchen.cabinets.map((c) => [c.id, c]));
      expect(back.kitchen.cabinets).toHaveLength(original.kitchen.cabinets.length);
      for (const c of back.kitchen.cabinets) {
        const o = byId.get(c.id)!;
        expect(c.productId).toBe(o.productId);
        expect(c.sku).toBe(o.sku);
        expect(c.finishIds).toEqual(o.finishIds);
        expect(c.configuration).toEqual(o.configuration);
        expect(c.width).toBeCloseTo(o.width, 3);
        expect(c.anchor.elevation).toBeCloseTo(o.anchor.elevation, 3);
        expect(c.anchor.x).toBeCloseTo(o.anchor.x, 3);
        expect(c.anchor.y).toBeCloseTo(o.anchor.y, 3);
      }
    });
  }
});

// ---------- web fixtures for the iOS side ----------

/** Deterministic ids so regenerated fixtures diff cleanly. */
function stabilize(p: Project, tag: string): Project {
  const map = new Map<string, string>();
  let n = 0;
  const id = (old: string) => {
    if (!map.has(old)) map.set(old, `0B0E${tag}00-0000-4000-8000-${(++n).toString(16).toUpperCase().padStart(12, '0')}`);
    return map.get(old)!;
  };
  const walls = p.walls.map((w) => ({ ...w, id: id(w.id) }));
  return {
    ...p,
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    walls,
    openings: p.openings.map((o) => ({ ...o, id: id(o.id), wallId: id(o.wallId) })),
    kitchen: { ...p.kitchen, cabinets: p.kitchen.cabinets.map((c) => ({ ...c, id: id(c.id), ...(c.wallId ? { wallId: id(c.wallId) } : {}) })) }
  };
}

function webFixtures(): Project[] {
  // 1. A North-American kitchen with a web style and per-cabinet options iOS doesn't model.
  let a = propose(newProject({ name: 'Web NA U-kitchen', room: defaultRoom('rectangle'), catalogId: 'na', units: 'imperial' }), 'u');
  a = { ...a, id: '0B0E0000-0000-4000-8000-00000000000A', kitchen: { ...a.kitchen, style: { ...stylePresets.find((s) => s.id === 'farmhouse')!.style }, countertop: { thickness: 30, overhang: 25 } } };
  a.walls = a.walls.map((w, i) => ({ ...w, verified: i % 2 === 0 }));
  a.kitchen.cabinets = a.kitchen.cabinets.map((c, i) =>
    i === 1 ? { ...c, finishIds: { ...c.finishIds, handle: 'bar-black' }, configuration: { ...c.configuration, hinge: 'right' } } : i === 2 ? { ...c, finishIds: { front: 'navy' } } : c
  );

  // 2. Starter catalog in an L room with deliberate problems, to compare design checks across platforms.
  let b = newProject({ name: 'Web checks', room: defaultRoom('l'), catalogId: 'starter', units: 'metric' });
  b = { ...b, id: '0B0E0000-0000-4000-8000-00000000000B' };
  const [w0, , , , w4] = b.walls;
  const base = makeCabinet(product('base-2d')!, b);
  const c1 = attach(base, w0, wallLength(w0) / 2, b); // under the window: base is fine…
  const c2 = { ...attach(makeCabinet(product('tall-pantry')!, b), w0, wallLength(w0) / 2 + 300, b), id: uid() }; // …tall over window + collides
  const door = b.openings.find((o) => o.kind === 'door')!;
  const doorWall = b.walls.find((w) => w.id === door.wallId)!;
  const c3 = attach(makeCabinet(product('base-1d')!, b), doorWall, door.position * wallLength(doorWall), b); // blocks the door
  const isl = makeCabinet(product('island')!, b);
  const c4 = { ...isl, rotation: c1.rotation, anchor: { x: c1.anchor.x, y: c1.anchor.y + 290 + 700 + 450, elevation: 0 } }; // aisle 70 cm
  const c5 = { ...attach(makeCabinet(product('wall-1d')!, b), w4, 400, b) };
  b.kitchen.cabinets = [c1, c2, c3, c4, c5];
  return [stabilize(a, '0A'), stabilize(b, '0B')];
}

describe('web fixtures for iOS', () => {
  it('are valid and stable', () => {
    for (const p of webFixtures()) expect(summarize(fromOpenPlan(JSON.parse(JSON.stringify(transferJson(p)))))).toEqual(summarize(p));
  });

  it('writes fixtures when OK3D_WEB_FIXTURE_OUT is set', () => {
    const out = process.env.OK3D_WEB_FIXTURE_OUT;
    if (!out) return;
    mkdirSync(out, { recursive: true });
    const src = join(__dirname, 'fixtures/web-source');
    mkdirSync(src, { recursive: true });
    for (const p of webFixtures()) {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      writeFileSync(join(out, `${slug}.openplan3d.json`), JSON.stringify(transferJson(p), null, 1) + '\n');
      writeFileSync(join(out, `${slug}.expected.json`), JSON.stringify(summarize(p), null, 1) + '\n');
      writeFileSync(join(src, `${slug}.project.json`), JSON.stringify(p, null, 1) + '\n');
    }
  });
});

export { toOpenPlan };
