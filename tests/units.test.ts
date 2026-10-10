import { describe, expect, it } from 'vitest';
import { fmtArea, fmtLen, parseLen } from '../src/lib/model/units';

describe('fmtArea', () => {
  it('shows square feet for imperial projects and m² for metric', () => {
    expect(fmtArea(1, 'imperial')).toBe('10.8 sq ft');
    expect(fmtArea(2.5, 'metric')).toBe('2.50 m²');
  });
});

describe('fmtLen', () => {
  it('carries rounded imperial inches into feet instead of printing 12″', () => {
    expect(fmtLen((7 * 12 + 11.9) * 25.4, 'imperial')).toBe('8′');
    expect(fmtLen((7 * 12 + 11.9) * 25.4, 'imperial', true)).toBe('7′ 11.875″');
    expect(fmtLen(11.8 * 25.4, 'imperial')).toBe('1′');
    expect(fmtLen(36 * 25.4, 'imperial')).toBe('3′');
    expect(fmtLen(30.5 * 25.4, 'imperial')).toBe('2′ 6.5″');
    expect(fmtLen(5.5 * 25.4, 'imperial')).toBe('5.5″');
  });

  it('formats metric lengths', () => {
    expect(fmtLen(600, 'metric')).toBe('600 mm');
    expect(fmtLen(2400, 'metric')).toBe('2.40 m');
    expect(fmtLen(2400, 'metric', true)).toBe('2400 mm');
  });
});

describe('parseLen', () => {
  it('parses feet and inches, unit suffixes and bare numbers', () => {
    expect(parseLen("3'6\"", 'imperial')).toBeCloseTo(42 * 25.4);
    expect(parseLen('24in', 'metric')).toBeCloseTo(24 * 25.4);
    expect(parseLen('60cm', 'imperial')).toBe(600);
    expect(parseLen('2.4m', 'metric')).toBe(2400);
    expect(parseLen('36', 'imperial')).toBeCloseTo(36 * 25.4);
    expect(parseLen('600', 'metric')).toBe(600);
    expect(parseLen('abc', 'metric')).toBeNull();
  });
});
