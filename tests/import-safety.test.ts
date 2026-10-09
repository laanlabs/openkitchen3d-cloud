import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { defaultRoom, newProject, propose } from '../src/lib/layout/templates';
import { checkProject, fromOpenPlan, toOpenPlan } from '../src/lib/io/openplan';
import { decodeShared } from '../src/lib/io/share';

const kitchen = () => propose(newProject({ name: 'Safety', room: defaultRoom('rectangle'), catalogId: 'starter', units: 'metric' }), 'l');

describe('import safety', () => {
  it('keeps the sender’s updatedAt so a newer local copy can be detected', () => {
    const p = { ...kitchen(), updatedAt: '2026-01-02T03:04:05.000Z' };
    const j = toOpenPlan(p) as Record<string, any>;
    delete j.openkitchen3d.webProject; // an iOS export
    delete j.openkitchen3d.producer;
    j.openkitchen3d.updatedAt = '2026-01-02T03:04:05.000Z';
    expect(fromOpenPlan(JSON.parse(JSON.stringify(j))).updatedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('rejects damaged files with a readable message instead of a TypeError', () => {
    const j = toOpenPlan(kitchen()) as Record<string, any>;
    delete j.openkitchen3d.webProject;
    delete j.openkitchen3d.producer;
    j.walls[0].transform = null;
    expect(() => fromOpenPlan(j)).toThrow(/damaged/);
  });

  it('rejects web projects with missing or non-numeric geometry', () => {
    const p = kitchen() as any;
    p.kitchen.cabinets[0].anchor.x = 'left';
    expect(() => checkProject(p)).toThrow(/cabinet is incomplete/);
    const q = kitchen() as any;
    q.walls[0].end = q.walls[0].start;
    expect(() => checkProject(q)).toThrow(/no length/);
    expect(() => checkProject({ schema: 'openkitchen3d/web-project@0.1' })).toThrow();
  });

  it('accepts a valid project unchanged', () => {
    const p = kitchen();
    expect(checkProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('share links with damaged projects fail closed', () => {
    const p = kitchen() as any;
    p.walls = 'nope';
    expect(() => decodeShared(compressToEncodedURIComponent(JSON.stringify(p)))).not.toThrow();
    expect(decodeShared(compressToEncodedURIComponent(JSON.stringify(p)))).toBeNull();
  });
});
