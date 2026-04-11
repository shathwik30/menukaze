import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  addMoney,
  formatMoney,
  isCurrencyCode,
  majorToMinor,
  minorToMajor,
} from './currency';

describe('isCurrencyCode', () => {
  it('accepts known codes', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('INR')).toBe(true);
    expect(isCurrencyCode('JPY')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(isCurrencyCode('usd')).toBe(false);
    expect(isCurrencyCode(123)).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
  });
});

describe('minor ↔ major conversion', () => {
  it('converts USD 1599 → 15.99', () => {
    expect(minorToMajor(1599, 'USD')).toBe(15.99);
  });

  it('converts USD 15.99 → 1599', () => {
    expect(majorToMinor(15.99, 'USD')).toBe(1599);
  });

  it('handles JPY zero-decimal currencies', () => {
    expect(minorToMajor(1500, 'JPY')).toBe(1500);
    expect(majorToMinor(1500, 'JPY')).toBe(1500);
  });

  it('handles KRW zero-decimal currencies', () => {
    expect(minorToMajor(50000, 'KRW')).toBe(50000);
    expect(majorToMinor(50000, 'KRW')).toBe(50000);
  });

  it('rounds half-cent edges to the nearest minor unit', () => {
    expect(majorToMinor(0.005, 'USD')).toBe(1);
    expect(majorToMinor(0.004, 'USD')).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats USD in en-US', () => {
    expect(formatMoney(1599, 'USD', 'en-US')).toBe('$15.99');
  });

  it('formats INR in en-IN', () => {
    // The exact glyph depends on ICU but it must contain ₹ and the integer + decimal
    const out = formatMoney(150000, 'INR', 'en-IN');
    expect(out).toContain('₹');
    expect(out).toContain('1,500.00');
  });

  it('formats JPY without decimals', () => {
    const out = formatMoney(1500, 'JPY', 'ja-JP');
    expect(out).toContain('1,500');
    expect(out).not.toContain('.');
  });
});

describe('addMoney', () => {
  it('adds amounts of the same currency', () => {
    const result = addMoney(
      { amountMinor: 100, currency: 'USD' },
      { amountMinor: 250, currency: 'USD' },
    );
    expect(result).toEqual({ amountMinor: 350, currency: 'USD' });
  });

  it('throws on currency mismatch', () => {
    expect(() =>
      addMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 250, currency: 'EUR' }),
    ).toThrow(/USD.*EUR/);
  });
});

describe('CURRENCIES registry', () => {
  it('every currency declares decimals and a name', () => {
    for (const [code, meta] of Object.entries(CURRENCIES)) {
      expect(meta.decimals, `code=${code}`).toBeGreaterThanOrEqual(0);
      expect(meta.decimals, `code=${code}`).toBeLessThanOrEqual(4);
      expect(meta.name.length, `code=${code}`).toBeGreaterThan(0);
    }
  });
});
