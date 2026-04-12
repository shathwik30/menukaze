/**
 * Currency utilities for Menukaze. All amounts in the system are stored as
 * integer minor units (cents, paise, etc.) to avoid float arithmetic.
 *
 * Display formatting goes through Intl.NumberFormat so we get correct symbol
 * placement, decimal separator, thousand separator, and decimal count for
 * every locale.
 */

export type CurrencyCode =
  | 'INR'
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'AED'
  | 'SAR'
  | 'AUD'
  | 'CAD'
  | 'NZD'
  | 'SGD'
  | 'MYR'
  | 'JPY'
  | 'KRW'
  | 'CNY'
  | 'BRL'
  | 'MXN'
  | 'ZAR'
  | 'NGN'
  | 'KES'
  | 'CHF'
  | 'SEK'
  | 'NOK'
  | 'DKK';

interface CurrencyMeta {
  /** ISO 4217 numeric exponent — number of decimal places this currency uses. */
  decimals: number;
  /** Display name in English (used for fallbacks; never user-facing without i18n). */
  name: string;
}

/**
 * The set of currencies the platform supports at launch. New currencies are
 * added by appending to this map and the `CurrencyCode` union above.
 *
 * Decimals match ISO 4217 (`exponent`) — JPY/KRW are zero-decimal.
 */
export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  INR: { decimals: 2, name: 'Indian Rupee' },
  USD: { decimals: 2, name: 'US Dollar' },
  EUR: { decimals: 2, name: 'Euro' },
  GBP: { decimals: 2, name: 'British Pound' },
  AED: { decimals: 2, name: 'UAE Dirham' },
  SAR: { decimals: 2, name: 'Saudi Riyal' },
  AUD: { decimals: 2, name: 'Australian Dollar' },
  CAD: { decimals: 2, name: 'Canadian Dollar' },
  NZD: { decimals: 2, name: 'New Zealand Dollar' },
  SGD: { decimals: 2, name: 'Singapore Dollar' },
  MYR: { decimals: 2, name: 'Malaysian Ringgit' },
  JPY: { decimals: 0, name: 'Japanese Yen' },
  KRW: { decimals: 0, name: 'South Korean Won' },
  CNY: { decimals: 2, name: 'Chinese Yuan' },
  BRL: { decimals: 2, name: 'Brazilian Real' },
  MXN: { decimals: 2, name: 'Mexican Peso' },
  ZAR: { decimals: 2, name: 'South African Rand' },
  NGN: { decimals: 2, name: 'Nigerian Naira' },
  KES: { decimals: 2, name: 'Kenyan Shilling' },
  CHF: { decimals: 2, name: 'Swiss Franc' },
  SEK: { decimals: 2, name: 'Swedish Krona' },
  NOK: { decimals: 2, name: 'Norwegian Krone' },
  DKK: { decimals: 2, name: 'Danish Krone' },
};

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

export function parseCurrencyCode(value: string): CurrencyCode {
  if (isCurrencyCode(value)) return value;
  throw new Error(`Unsupported currency code: ${value}`);
}

export function currencyCodeOrDefault(
  value: string | null | undefined,
  fallback: CurrencyCode = 'USD',
): CurrencyCode {
  return isCurrencyCode(value) ? value : fallback;
}

/** Convert minor units to a major-unit number. JPY 1500 → 1500. USD 1500 → 15.00. */
export function minorToMajor(amountMinor: number, currency: CurrencyCode): number {
  const decimals = CURRENCIES[currency].decimals;
  return amountMinor / 10 ** decimals;
}

/** Convert a major-unit number to minor units. USD 15.99 → 1599. JPY 1500 → 1500. */
export function majorToMinor(amountMajor: number, currency: CurrencyCode): number {
  const decimals = CURRENCIES[currency].decimals;
  return Math.round(amountMajor * 10 ** decimals);
}

/**
 * Locale-aware display formatting.
 *
 * @example
 * formatMoney(1599, 'USD', 'en-US')   // "$15.99"
 * formatMoney(1599, 'INR', 'en-IN')   // "₹15.99"
 * formatMoney(1500, 'JPY', 'ja-JP')   // "￥1,500"
 * formatMoney(150000, 'EUR', 'de-DE') // "1.500,00 €"
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: CURRENCIES[currency].decimals,
    maximumFractionDigits: CURRENCIES[currency].decimals,
  });
  return formatter.format(minorToMajor(amountMinor, currency));
}

/**
 * Add two amounts of the same currency, throwing if currencies mismatch.
 * Used by the order subtotal/tax/tip calculation pipeline so a runtime
 * mismatch surfaces immediately instead of silently rounding.
 */
export function addMoney(
  a: { amountMinor: number; currency: CurrencyCode },
  b: { amountMinor: number; currency: CurrencyCode },
): { amountMinor: number; currency: CurrencyCode } {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} and ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}
