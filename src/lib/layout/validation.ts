// Deterministic, machine-readable design checks — a port of openkitchen3d-ios Design/Validation.swift
// with the same stable rule ids, plus appliance door swing. Guidance only, never a code-compliance claim.
import {
  add, cabinetCenter, cabinetCorners, cabinetFront, deg, footprint, inwardNormal, polygonCentroid, norm,
  pointInPolygon, polygonDistance, rectanglesOverlap, roomPolygon, scale, sub, wallPoint
} from '../model/geometry';
import type { KitchenCabinetInstance, Project, Vec2 } from '../model/types';
import { product } from '../catalog/catalog';
import { blocksOpening, verticalOverlap } from './layout';

export type Severity = 'error' | 'warning' | 'info';

export interface DesignWarning {
  rule: string;
  severity: Severity;
  message: string;
  cabinetIds: string[];
  id: string;
}

export const MIN_AISLE = 1000;

const name = (c: KitchenCabinetInstance) => `${product(c.productId)?.name ?? 'Cabinet'} ${Math.round(c.width)}`;

const warn = (rule: string, severity: Severity, message: string, cabinetIds: string[]): DesignWarning => ({
  rule, severity, message, cabinetIds, id: rule + cabinetIds.join('') + message
});

export function validate(p: Project): DesignWarning[] {
  const out: DesignWarning[] = [];
  const cabs = p.kitchen.cabinets;

  for (let i = 0; i < cabs.length; i++)
    for (let j = i + 1; j < cabs.length; j++) {
      const a = cabs[i], b = cabs[j];
      if (verticalOverlap(a, b) && rectanglesOverlap(cabinetCorners(a), cabinetCorners(b)))
        out.push(warn('OK-COLLIDE', 'error', `${name(a)} overlaps ${name(b)}`, [a.id, b.id]));
    }

  for (const c of cabs) {
    for (const o of p.openings) {
      const wall = p.walls.find((w) => w.id === o.wallId);
      if (!wall) continue;
      if (o.kind === 'window') {
        if (c.wallId === wall.id && blocksOpening(c, wall, p) && c.anchor.elevation + c.height > o.sillHeight + 10)
          out.push(warn('OK-WINDOW', 'warning', `${name(c)} covers a window`, [c.id]));
      } else if (c.anchor.elevation < 500) {
        // Clear zone in front of the doorway: opening width × opening width.
        const n = inwardNormal(p, wall);
        const center = add(wallPoint(wall, o.position), scale(n, o.width / 2)); // same zone as iOS, for fixture parity
        const zone = footprint(center, deg(Math.atan2(-n.x, n.y)), o.width, o.width);
        if (rectanglesOverlap(zone, cabinetCorners(c)))
          out.push(warn('OK-DOOR', 'error', `${name(c)} blocks a ${o.kind === 'door' ? 'door' : 'doorway'}`, [c.id]));
      }
    }
  }

  const poly = roomPolygon(p);
  if (poly) {
    const centroid = polygonCentroid(poly);
    const inside = (q: Vec2) => {
      // Nudge toward the centroid so cabinets flush to a wall face count as inside.
      const nudged = add(q, scale(norm(sub(centroid, q)), 20));
      return pointInPolygon(poly, nudged);
    };
    for (const c of cabs)
      if (!cabinetCorners(c).every(inside)) out.push(warn('OK-OUTSIDE', 'error', `${name(c)} extends outside the room`, [c.id]));
  }

  for (const island of cabs.filter((c) => c.family === 'island')) {
    for (const other of cabs) {
      if (other.id === island.id || other.anchor.elevation >= 500) continue;
      const d = polygonDistance(cabinetCorners(island), cabinetCorners(other));
      if (d > 0 && d < MIN_AISLE)
        out.push(warn('OK-AISLE', 'warning', `Aisle between ${name(island)} and ${name(other)} is ${Math.round(d / 10)} cm (aim for ≥ 100 cm)`, [island.id, other.id]));
    }
  }

  // Appliance door swing: the zone in front of a fridge, dishwasher or oven must be clear of floor cabinets.
  for (const c of cabs) {
    const fronts = product(c.productId)?.fronts;
    if (!fronts || !['fridge', 'dishwasher', 'oven', 'range'].includes(fronts)) continue;
    const swing = fronts === 'fridge' ? Math.min(c.width, 900) : 600;
    const center = add(cabinetCenter(c), scale(cabinetFront(c), c.depth / 2 + swing / 2 + 2));
    const zone = footprint(center, c.rotation, c.width - 10, swing);
    for (const o of cabs) {
      if (o.id === c.id || o.anchor.elevation >= 500) continue;
      if (rectanglesOverlap(zone, cabinetCorners(o)))
        out.push(warn('OK-SWING', 'warning', `${name(c)} door swing is blocked by ${name(o)}`, [c.id, o.id]));
    }
  }

  // Wall cabinets that overrun the ceiling.
  for (const c of cabs)
    if (c.anchor.elevation + c.height > p.ceilingHeight + 1)
      out.push(warn('OK-CEILING', 'error', `${name(c)} is taller than the ceiling`, [c.id]));

  if (!(p.ceilingVerified && p.walls.every((w) => w.verified)))
    out.push(warn('OK-UNVERIFIED', 'info', 'Some wall lengths or the ceiling height are not field-verified yet', []));

  return out;
}
