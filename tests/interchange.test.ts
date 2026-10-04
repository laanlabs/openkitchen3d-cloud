import { describe, expect, it } from 'vitest';
import { defaultRoom, newProject, propose } from '../src/lib/layout/templates';
import { fromOpenPlan, toOpenPlan, KITCHEN_SCHEMA } from '../src/lib/io/openplan';
import { decodeShared } from '../src/lib/io/share';
import { compressToEncodedURIComponent } from 'lz-string';
import { generateParts } from '../src/lib/layout/runs';
import { validate } from '../src/lib/layout/validation';
import { parseLen, fmtLen } from '../src/lib/model/units';

const kitchen = () => propose(newProject({ name: 'Round trip', room: defaultRoom('l'), catalogId: 'starter', units: 'metric' }), 'l');

describe('OpenPlan3D / iOS interchange', () => {
  it('writes the prepared RoomPlan contract (metres, handoff v1, kitchen block)', () => {
    const j = toOpenPlan(kitchen()) as Record<string, any>;
    expect(j.openplanPrepared).toBe(true);
    expect(j.openplanHandoffVersion).toBe(1);
    expect(j.openkitchen3d.schema).toBe(KITCHEN_SCHEMA);
    expect(j.walls[0].dimensions[0]).toBeLessThan(20); // metres, not mm
    expect(j.walls[0].transform).toHaveLength(16);
    const wallCab = j.openkitchen3d.cabinets.find((c: any) => c.family === 'wall');
    const obj = j.objects.find((o: any) => o.identifier === wallCab.id);
    expect(obj.transform[13]).toBeCloseTo(wallCab.elevation + wallCab.height / 2, 3); // y = elevation + h/2
  });

  it('imports an iOS export (no web block) with the same cabinets, SKUs, finishes and wall-cabinet elevations', () => {
    const p = kitchen();
    const j = toOpenPlan(p) as Record<string, any>;
    delete j.openkitchen3d.webProject; // what openkitchen3d-ios writes
    delete j.openkitchen3d.producer;
    const back = fromOpenPlan(JSON.parse(JSON.stringify(j)));
    expect(back.kitchen.cabinets).toHaveLength(p.kitchen.cabinets.length);
    for (const c of p.kitchen.cabinets) {
      const b = back.kitchen.cabinets.find((x) => x.id === c.id)!;
      expect(b.sku).toBe(c.sku);
      expect(b.productId).toBe(c.productId);
      expect(b.wallId).toBe(c.wallId);
      expect(b.anchor.elevation).toBeCloseTo(c.anchor.elevation, 0);
      expect(b.anchor.x).toBeCloseTo(c.anchor.x, 0);
      expect(b.anchor.y).toBeCloseTo(c.anchor.y, 0);
      expect(((b.rotation - c.rotation) % 360 + 360) % 360).toBeCloseTo(0, 3);
    }
    expect(back.walls).toHaveLength(p.walls.length);
    expect(back.openings).toHaveLength(p.openings.length);
    // Same design → same generated parts and the same warnings on both sides.
    expect(generateParts(back).map((g) => [g.kind, Math.round(g.width)])).toEqual(generateParts(p).map((g) => [g.kind, Math.round(g.width)]));
    expect(validate(back).map((w) => w.rule)).toEqual(validate(p).map((w) => w.rule));
  });

  it('round-trips a web project losslessly through its own export', () => {
    const p = kitchen();
    expect(fromOpenPlan(JSON.parse(JSON.stringify(toOpenPlan(p))))).toEqual(p);
  });

  it('decodes share links and rejects junk', () => {
    const p = kitchen();
    expect(decodeShared(compressToEncodedURIComponent(JSON.stringify(p)))).toEqual(p);
    expect(decodeShared('garbage')).toBeNull();
  });
});

describe('units', () => {
  it('parses metric and imperial input', () => {
    expect(parseLen('600', 'metric')).toBe(600);
    expect(parseLen('2.4m', 'metric')).toBe(2400);
    expect(parseLen('60cm', 'imperial')).toBe(600);
    expect(parseLen('24', 'imperial')).toBeCloseTo(609.6);
    expect(parseLen("3'6\"", 'metric')).toBeCloseTo(1066.8);
    expect(parseLen('abc', 'metric')).toBeNull();
    expect(fmtLen(2438.4, 'imperial')).toBe('8′');
  });
});
