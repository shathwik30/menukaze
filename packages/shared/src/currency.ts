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
  decimals: number;
  name: string;
}

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

export function minorToMajor(amountMinor: number, currency: CurrencyCode): number {
  const decimals = CURRENCIES[currency].decimals;
  return amountMinor / 10 ** decimals;
}

export function majorToMinor(amountMajor: number, currency: CurrencyCode): number {
  const decimals = CURRENCIES[currency].decimals;
  return Math.round(amountMajor * 10 ** decimals);
}

export function formatMoney(amountMinor: number, currency: CurrencyCode, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: CURRENCIES[currency].decimals,
    maximumFractionDigits: CURRENCIES[currency].decimals,
  });
  return formatter.format(minorToMajor(amountMinor, currency));
}

export function addMoney(
  a: { amountMinor: number; currency: CurrencyCode },
  b: { amountMinor: number; currency: CurrencyCode },
): { amountMinor: number; currency: CurrencyCode } {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} and ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}
