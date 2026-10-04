import { describe, expect, it } from 'vitest';
import { defaultRoom, newProject, propose, layoutKinds } from '../src/lib/layout/templates';
import { attach, drag, makeCabinet, place } from '../src/lib/layout/layout';
import { generateParts, schedule, scheduleTotal } from '../src/lib/layout/runs';
import { validate } from '../src/lib/layout/validation';
import { allProducts, product, productsFor } from '../src/lib/catalog/catalog';
import { alongWall, cabinetCenter, cabinetCorners, footprint, rectanglesOverlap, wallLength } from '../src/lib/model/geometry';
import type { CatalogId, Project } from '../src/lib/model/types';

const mk = (catalogId: CatalogId = 'starter', shape: 'rectangle' | 'l' | 'galley' | 'open' = 'rectangle') =>
  newProject({ name: 'Test', room: defaultRoom(shape), catalogId, units: 'metric' });

const add = (p: Project, id: string, wallIdx = 0): Project => {
  const c = place(product(id)!, p, p.walls[wallIdx].id);
  return { ...p, kitchen: { ...p.kitchen, cabinets: [...p.kitchen.cabinets, c] } };
};

describe('catalog', () => {
  it('ships only redistributable generic items plus the iOS starter set', () => {
    expect(productsFor('starter')).toHaveLength(17);
    expect(allProducts.some((p) => p.variants.some((v) => /^\d{3}\.\d{3}\.\d{2}$/.test(v.sku)))).toBe(false); // no IKEA article numbers
    for (const id of ['na', 'eu'] as const) {
      const tabs = new Set(productsFor(id).map((p) => p.tab));
      for (const t of ['base', 'wall', 'tall', 'appliance', 'island']) expect(tabs.has(t as never)).toBe(true);
    }
  });
});

describe('placement', () => {
  it('drops cabinets into the first free slot, touching neighbours with 0 mm gap', () => {
    let p = mk();
    p = add(p, 'base-1d');
    p = add(p, 'base-1d');
    const [a, b] = p.kitchen.cabinets;
    const wall = p.walls.find((w) => w.id === a.wallId)!;
    expect(b.wallId).toBe(a.wallId);
    const gap = alongWall(wall, cabinetCenter(b)) - b.width / 2 - (alongWall(wall, cabinetCenter(a)) + a.width / 2);
    expect(Math.abs(gap)).toBeLessThan(0.5);
  });

  it('snaps a dragged cabinet flush to its neighbour', () => {
    let p = mk();
    p = add(p, 'base-1d');
    const a = p.kitchen.cabinets[0];
    const wall = p.walls.find((w) => w.id === a.wallId)!;
    const free = makeCabinet(product('base-1d')!, p);
    const near = attach(free, wall, alongWall(wall, cabinetCenter(a)) + a.width + 50, p);
    const snapped = drag(near, cabinetCenter(near), p);
    const gap = alongWall(wall, cabinetCenter(snapped)) - snapped.width / 2 - (alongWall(wall, cabinetCenter(a)) + a.width / 2);
    expect(Math.abs(gap)).toBeLessThan(0.5);
  });

  it('hangs wall cabinets at their catalog elevation and lets base + wall share a footprint', () => {
    let p = mk();
    p = add(p, 'base-1d');
    p = add(p, 'wall-1d');
    const [b, w] = p.kitchen.cabinets;
    expect(w.anchor.elevation).toBe(1450);
    expect(validate(p).filter((x) => x.rule === 'OK-COLLIDE')).toHaveLength(0);
    expect(rectanglesOverlap(cabinetCorners(b), cabinetCorners(w))).toBe(true);
  });

  it('flags overlapping cabinets', () => {
    let p = mk();
    p = add(p, 'base-1d');
    const c = { ...p.kitchen.cabinets[0], id: 'X' };
    p = { ...p, kitchen: { ...p.kitchen, cabinets: [...p.kitchen.cabinets, c] } };
    expect(validate(p).some((w) => w.rule === 'OK-COLLIDE')).toBe(true);
  });
});

describe('starter layouts', () => {
  for (const shape of ['rectangle', 'l', 'galley', 'open'] as const)
    for (const cat of ['starter', 'na', 'eu'] as const)
      for (const k of layoutKinds.filter((k) => k.id !== 'empty'))
        it(`${k.id} in a ${shape} room (${cat}) has zero errors`, () => {
          const p = propose(mk(cat, shape), k.id);
          expect(p.kitchen.cabinets.length).toBeGreaterThan(3);
          expect(validate(p).filter((w) => w.severity === 'error')).toEqual([]);
        });
});

describe('run solver', () => {
  it('generates one slab per straight run, butt-jointed at the corner of an L', () => {
    const p = propose(mk(), 'l');
    const tops = generateParts(p).filter((g) => g.kind === 'countertop');
    expect(tops.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < tops.length; i++)
      for (let j = i + 1; j < tops.length; j++) {
        const a = footprint(tops[i].center, tops[i].rotation, tops[i].width, tops[i].depth);
        const b = footprint(tops[j].center, tops[j].rotation, tops[j].width, tops[j].depth);
        expect(rectanglesOverlap(a, b, 1)).toBe(false);
      }
  });

  it('is deterministic: reload reproduces identical geometry', () => {
    const p = propose(mk('na'), 'u');
    const again = JSON.parse(JSON.stringify(p));
    expect(generateParts(again)).toEqual(generateParts(p));
  });

  it('schedule total equals the sum of its lines and every cabinet is listed', () => {
    const p = propose(mk('eu'), 'island');
    const lines = schedule(p);
    expect(scheduleTotal(lines)).toBe(lines.reduce((s, l) => s + l.unitPrice * (l.key.startsWith('top:') || l.key === 'toekick' ? 1 : l.qty), 0));
    expect(lines.filter((l) => !l.auto).reduce((s, l) => s + l.qty, 0)).toBe(p.kitchen.cabinets.length);
  });

  it('adds a filler for a small gap at the end of a run', () => {
    let p = mk();
    const wall = p.walls[0];
    const L = wallLength(wall);
    const c = attach(makeCabinet(product('base-1d')!, p), wall, L - wall.thickness / 2 - 60 - 300, p);
    p = { ...p, kitchen: { ...p.kitchen, cabinets: [c] } };
    const fillers = generateParts(p).filter((g) => g.kind === 'filler');
    expect(fillers).toHaveLength(1);
    expect(Math.round(fillers[0].width)).toBe(60);
  });
});
