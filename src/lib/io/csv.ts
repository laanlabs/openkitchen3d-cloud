import type { Project } from '../model/types';
import { schedule, scheduleTotal } from '../layout/runs';
import { fronts, swatch, countertops, carcasses } from '../catalog/catalog';

const q = (s: string | number) => (typeof s === 'number' ? String(s) : `"${s.replace(/"/g, '""')}"`);

export function finishName(id: string) {
  return [...fronts, ...countertops, ...carcasses].find((s) => s.id === id)?.name ?? id;
}

/** Cabinet schedule / bill of materials. Opens in Excel; totals equal the sum of the lines. */
export function scheduleCsv(p: Project): string {
  const lines = schedule(p);
  const rows = ['Qty,SKU,Description,Finish,Width (mm),Depth (mm),Height (mm),Unit price,Line total,Auto-added'];
  for (const l of lines)
    rows.push([l.qty, q(l.sku), q(l.description), q(finishName(l.finish)), Math.round(l.width), Math.round(l.depth), Math.round(l.height), l.unitPrice, l.total, l.auto ? 'yes' : ''].join(','));
  rows.push(['', '', q('Total (estimate)'), '', '', '', '', '', scheduleTotal(lines), ''].join(','));
  return '﻿' + rows.join('\r\n') + '\r\n';
}

export { swatch };
