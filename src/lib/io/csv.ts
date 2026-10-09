import type { Project } from '../model/types';
import { schedule, scheduleTotal } from '../layout/runs';
import { fronts, swatch, countertops, carcasses } from '../catalog/catalog';

/**
 * Quoted CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets a
 * leading apostrophe, since SKUs and names can come from imported files.
 */
const q = (s: string | number) => {
  if (typeof s === 'number') return String(s);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function finishName(id: string) {
  return [...fronts, ...countertops, ...carcasses].find((s) => s.id === id)?.name ?? id;
}

/** Cabinet schedule / bill of materials. Opens in Excel; totals equal the sum of the lines. */
export function scheduleCsv(p: Project): string {
  const lines = schedule(p);
  // Sizes in the project's units: whole millimetres, or inches to the nearest 1/8.
  const imperial = p.units === 'imperial';
  const size = (mm: number) => (imperial ? Math.round((mm / 25.4) * 8) / 8 : Math.round(mm));
  const unit = imperial ? 'in' : 'mm';
  const rows = [`Qty,SKU,Description,Finish,Width (${unit}),Depth (${unit}),Height (${unit}),Unit price (${p.kitchen.currency}),Line total (${p.kitchen.currency}),Auto-added`];
  for (const l of lines)
    rows.push([l.qty, q(l.sku), q(l.description), q(finishName(l.finish)), size(l.width), size(l.depth), size(l.height), l.unitPrice, l.total, l.auto ? 'yes' : ''].join(','));
  rows.push(['', '', q('Total (estimate)'), '', '', '', '', '', scheduleTotal(lines), ''].join(','));
  return '﻿' + rows.join('\r\n') + '\r\n';
}

export { swatch };
