import type { Units } from './types';

export function fmtLen(mm: number, units: Units, precise = false): string {
  if (units === 'imperial') {
    const inches = mm / 25.4;
    const ft = Math.floor(inches / 12);
    const rest = inches - ft * 12;
    const r = precise ? Math.round(rest * 8) / 8 : Math.round(rest * 2) / 2;
    if (ft === 0) return `${r}″`;
    return r === 0 ? `${ft}′` : `${ft}′ ${r}″`;
  }
  return precise || mm < 1000 ? `${Math.round(mm)} mm` : `${(mm / 1000).toFixed(2)} m`;
}

/** Short label for catalog widths, e.g. 600 / 24″ */
export const fmtShort = (mm: number, units: Units) =>
  units === 'imperial' ? `${Math.round((mm / 25.4) * 2) / 2}″` : `${Math.round(mm)}`;

/** Parses user input: "600", "60cm", "2.4m", "24in", 24\", 3'6\" → mm. */
export function parseLen(text: string, units: Units): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, '.');
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|′|ft)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|in)?)?$/);
  if (ftIn) return (Number(ftIn[1]) * 12 + Number(ftIn[2] ?? 0)) * 25.4;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|"|″)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'mm': return n;
    case 'cm': return n * 10;
    case 'm': return n * 1000;
    case 'in': case '"': case '″': return n * 25.4;
    default: return units === 'imperial' ? n * 25.4 : n;
  }
}

export const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
