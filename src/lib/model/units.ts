import type { Units } from './types';

export function fmtLen(mm: number, units: Units, precise = false): string {
  if (units === 'imperial') {
    // Round the whole length to the display step first, so 11.9″ carries into the next foot
    // instead of printing 7′ 12″.
    const step = precise ? 8 : 2;
    const totalSteps = Math.round((mm / 25.4) * step);
    const ft = Math.floor(totalSteps / (12 * step));
    const r = totalSteps - ft * 12 * step;
    if (ft === 0) return `${inches(r, step)}″`;
    return r === 0 ? `${ft}′` : `${ft}′ ${inches(r, step)}″`;
  }
  return precise || mm < 1000 ? `${Math.round(mm)} mm` : `${(mm / 1000).toFixed(2)} m`;
}

/** `steps` 1/`step` inches as a tape-measure fraction: 93 eighths → "11 5/8". */
function inches(steps: number, step: number): string {
  const whole = Math.floor(steps / step);
  let n = steps - whole * step, d = step;
  if (n === 0) return `${whole}`;
  while (n % 2 === 0) { n /= 2; d /= 2; }
  return whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
}

/** Area given in m², shown as m² or square feet. */
export function fmtArea(m2: number, units: Units): string {
  return units === 'imperial' ? `${(m2 / 0.09290304).toFixed(1)} sq ft` : `${m2.toFixed(2)} m²`;
}

/** Short label for catalog widths, e.g. 600 / 24″ */
export const fmtShort = (mm: number, units: Units) =>
  units === 'imperial' ? `${inches(Math.round((mm / 25.4) * 2), 2)}″` : `${Math.round(mm)}`;

const UNICODE_FRACTIONS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
/** A number: "36", "36.5", "36 1/2", "36-1/2" or "1/2". */
const NUM = String.raw`(\d+(?:\.\d+)?(?:[ -]\d+\/\d+)?|\d+\/\d+)`;
const FT_IN = new RegExp(String.raw`^${NUM} ?(?:'|′|ft|feet|foot) ?-? ?(?:${NUM} ?(?:"|″|in|inch|inches)?)?$`);
const SINGLE = new RegExp(String.raw`^(-?${NUM}) ?(mm|cm|m|in|inch|inches|"|″)?$`);

function num(t: string): number {
  const f = t.match(/^(?:(\d+(?:\.\d+)?)[ -])?(\d+)\/(\d+)$/);
  if (!f) return Number(t);
  return Number(f[3]) ? Number(f[1] ?? 0) + Number(f[2]) / Number(f[3]) : NaN;
}

/**
 * Parses user input to mm: "600", "60cm", "2.4m", "24in", 24", 3'6", and tape-measure fractions
 * such as 36 1/2, 36-1/2", 3' 6 1/2", 3'-6½".
 */
export function parseLen(text: string, units: Units): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '.')
    .replace(/[’‘`]/g, "'").replace(/[”“]/g, '"') // iOS smart punctuation
    .replace(/(\d)?\s*([½¼¾⅛⅜⅝⅞])/g, (_, d, c) => `${d ? d + ' ' : ''}${UNICODE_FRACTIONS[c]}`)
    .replace(/\s+/g, ' ');
  const ftIn = s.match(FT_IN);
  const mm = ftIn ? (num(ftIn[1]) * 12 + (ftIn[2] ? num(ftIn[2]) : 0)) * 25.4 : single(s, units);
  return mm != null && Number.isFinite(mm) ? mm : null;
}

function single(s: string, units: Units): number | null {
  const m = s.match(SINGLE);
  if (!m) return null;
  const n = m[1].startsWith('-') ? -num(m[1].slice(1)) : num(m[1]);
  switch (m[3]) {
    case 'mm': return n;
    case 'cm': return n * 10;
    case 'm': return n * 1000;
    case 'in': case 'inch': case 'inches': case '"': case '″': return n * 25.4;
    default: return units === 'imperial' ? n * 25.4 : n;
  }
}

export const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
