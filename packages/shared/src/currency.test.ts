import { describe, expect, it } from 'vitest';
import {
  addMoney,
  currencyCodeOrDefault,
  formatMoney,
  isCurrencyCode,
  majorToMinor,
  minorToMajor,
  parseCurrencyCode,
} from './currency';

describe('isCurrencyCode / parseCurrencyCode / currencyCodeOrDefault', () => {
  it('recognises supported ISO codes', () => {
    expect(isCurrencyCode('INR')).toBe(true);
    expect(isCurrencyCode('usd')).toBe(false);
    expect(isCurrencyCode('XYZ')).toBe(false);
  });

  it('parses known codes and throws on unknown ones', () => {
    expect(parseCurrencyCode('GBP')).toBe('GBP');
    expect(() => parseCurrencyCode('XYZ')).toThrow();
  });

  it('currencyCodeOrDefault falls back to USD when the value is unknown', () => {
    expect(currencyCodeOrDefault('INR')).toBe('INR');
    expect(currencyCodeOrDefault(null)).toBe('USD');
    expect(currencyCodeOrDefault('ABC', 'EUR')).toBe('EUR');
  });
});

describe('minorToMajor / majorToMinor', () => {
  it('respects the ISO exponent per currency', () => {
    expect(minorToMajor(1599, 'USD')).toBe(15.99);
    expect(minorToMajor(1500, 'JPY')).toBe(1500);
    expect(minorToMajor(1500, 'KRW')).toBe(1500);
  });

  it('rounds fractional majors to the nearest minor unit', () => {
    expect(majorToMinor(15.994, 'USD')).toBe(1599);
    expect(majorToMinor(15.996, 'USD')).toBe(1600);
    expect(majorToMinor(1234.5, 'JPY')).toBe(1235);
  });
});

describe('formatMoney', () => {
  it('applies locale-aware symbols and separators', () => {
    expect(formatMoney(1599, 'USD', 'en-US')).toContain('15.99');
    expect(formatMoney(1599, 'USD', 'en-US')).toContain('$');
  });

  it('renders zero-decimal currencies without decimals', () => {
    expect(formatMoney(1500, 'JPY', 'ja-JP')).not.toContain('.');
  });
});

describe('addMoney', () => {
  it('sums same-currency amounts', () => {
    expect(
      addMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 250, currency: 'USD' }),
    ).toEqual({ amountMinor: 350, currency: 'USD' });
  });

  it('throws on currency mismatch', () => {
    expect(() =>
      addMoney({ amountMinor: 100, currency: 'USD' }, { amountMinor: 100, currency: 'INR' }),
    ).toThrow();
  });
});
