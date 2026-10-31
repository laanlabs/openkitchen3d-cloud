import type { CatalogId, Project } from './types';

/**
 * Currencies a kitchen can be priced in. Catalog prices are rough list-price estimates kept as plain
 * numbers, and kitchen list prices sit at about the same number in dollars and euros, so switching
 * currency changes the symbol, not the amounts.
 */
export const currencies = [
  { id: 'USD', name: 'US dollar ($)' },
  { id: 'EUR', name: 'Euro (€)' }
] as const;

const EURO_AREA = new Set(['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES']);

function region(locale: string): string | undefined {
  try { return new Intl.Locale(locale).maximize().region; } catch { return undefined; }
}

const browserLocale = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

/** EU catalog → euros, North American → dollars, starter → from the browser's region. */
export function defaultCurrency(catalogId: CatalogId, locale = browserLocale()): string {
  if (catalogId === 'eu') return 'EUR';
  if (catalogId === 'na') return 'USD';
  return EURO_AREA.has(region(locale) ?? '') ? 'EUR' : 'USD';
}

/** Kitchens on the EU catalog saved before currency could be chosen were always USD. */
export function withCatalogCurrency<P extends Project | undefined>(p: P): P {
  if (!p || p.catalogId !== 'eu' || p.kitchen.currency !== 'USD') return p;
  return { ...p, kitchen: { ...p.kitchen, currency: 'EUR' } };
}
