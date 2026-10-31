import { describe, expect, it } from 'vitest';
import { defaultCurrency, withCatalogCurrency } from '../src/lib/model/currency';
import { money } from '../src/lib/model/units';
import { defaultRoom, newProject } from '../src/lib/layout/templates';
import { compressToEncodedURIComponent } from 'lz-string';
import { decodeShared } from '../src/lib/io/share';
import { fromOpenPlan, toOpenPlan } from '../src/lib/io/openplan';

const mk = (catalogId: 'starter' | 'na' | 'eu') => newProject({ name: 'k', room: defaultRoom('rectangle'), catalogId, units: 'metric' });

describe('currency', () => {
  it('follows the catalog, then the browser region for the starter catalog', () => {
    expect(defaultCurrency('eu', 'en-US')).toBe('EUR');
    expect(defaultCurrency('na', 'de-DE')).toBe('USD');
    expect(defaultCurrency('starter', 'de-DE')).toBe('EUR');
    expect(defaultCurrency('starter', 'fr')).toBe('EUR');
    expect(defaultCurrency('starter', 'en-IE')).toBe('EUR');
    expect(defaultCurrency('starter', 'en-US')).toBe('USD');
    expect(defaultCurrency('starter', 'en-GB')).toBe('USD');
    expect(defaultCurrency('starter', 'not a locale!')).toBe('USD');
    expect(mk('eu').kitchen.currency).toBe('EUR');
  });

  it('moves EU-catalog kitchens saved as USD to euros, and leaves others alone', () => {
    const old = { ...mk('eu'), kitchen: { ...mk('eu').kitchen, currency: 'USD' } };
    expect(withCatalogCurrency(old).kitchen.currency).toBe('EUR');
    const na = mk('na');
    expect(withCatalogCurrency(na)).toBe(na);
    expect(withCatalogCurrency(undefined)).toBeUndefined();
  });

  it('carries the currency through share links and project files', () => {
    const p = { ...mk('starter'), kitchen: { ...mk('starter').kitchen, currency: 'EUR' } };
    expect(decodeShared(compressToEncodedURIComponent(JSON.stringify(p)))?.kitchen.currency).toBe('EUR');
    expect(fromOpenPlan(JSON.parse(JSON.stringify(toOpenPlan(p)))).kitchen.currency).toBe('EUR');
  });

  it('formats euros and survives unknown currency codes', () => {
    expect(money(1234, 'EUR')).toContain('€');
    expect(money(1234, 'nope')).toMatch(/1.?234 nope/);
  });
});
