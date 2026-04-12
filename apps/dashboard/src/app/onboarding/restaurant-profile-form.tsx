'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createRestaurantAction } from '@/app/actions/onboarding';

/**
 * Country → derived defaults. Picking a country auto-fills the currency,
 * locale, and IANA timezone fields. Users can override locale/timezone later
 * from Settings; currency is locked at restaurant creation.
 */
const COUNTRY_DEFAULTS = {
  IN: { name: 'India', currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata' },
  US: { name: 'United States', currency: 'USD', locale: 'en-US', timezone: 'America/Los_Angeles' },
  GB: { name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London' },
  AE: { name: 'United Arab Emirates', currency: 'AED', locale: 'en-AE', timezone: 'Asia/Dubai' },
  SG: { name: 'Singapore', currency: 'SGD', locale: 'en-SG', timezone: 'Asia/Singapore' },
  AU: { name: 'Australia', currency: 'AUD', locale: 'en-AU', timezone: 'Australia/Sydney' },
  CA: { name: 'Canada', currency: 'CAD', locale: 'en-CA', timezone: 'America/Toronto' },
  DE: { name: 'Germany', currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' },
  FR: { name: 'France', currency: 'EUR', locale: 'fr-FR', timezone: 'Europe/Paris' },
  JP: { name: 'Japan', currency: 'JPY', locale: 'ja-JP', timezone: 'Asia/Tokyo' },
} as const;

type CountryCode = keyof typeof COUNTRY_DEFAULTS;
const COUNTRY_CODES = [
  'IN',
  'US',
  'GB',
  'AE',
  'SG',
  'AU',
  'CA',
  'DE',
  'FR',
  'JP',
] as const satisfies readonly CountryCode[];
const COUNTRY_CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

function isCountryCode(value: string): value is CountryCode {
  return COUNTRY_CODE_SET.has(value);
}

/** kebab-case slugify with the same rules as the slugSchema in @menukaze/shared. */
function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function RestaurantProfileForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [country, setCountry] = useState<CountryCode>('IN');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const defaults = COUNTRY_DEFAULTS[country];

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(toSlug(value));
  }

  function onSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(toSlug(value));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRestaurantAction({
        name: name.trim(),
        slug,
        country,
        currency: defaults.currency,
        locale: defaults.locale,
        timezone: defaults.timezone,
        addressStructured: {
          line1: line1.trim(),
          city: city.trim(),
          state: state.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          country,
        },
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/onboarding/menu');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Restaurant name" hint="The name your customers see.">
        <input
          type="text"
          required
          minLength={1}
          maxLength={120}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label="Subdomain"
        hint={
          slug
            ? `Your storefront will live at ${slug}.menukaze.com`
            : 'Auto-generated from the name above.'
        }
      >
        <div className="border-input flex items-center rounded-md border bg-transparent">
          <input
            type="text"
            required
            minLength={2}
            maxLength={64}
            pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
            className="focus-visible:ring-ring flex-1 rounded-l-md bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <span className="text-muted-foreground border-input border-l px-3 text-sm">
            .menukaze.com
          </span>
        </div>
      </Field>

      <Field label="Country" hint="Locks in currency, locale, tax format, and time zone.">
        <select
          required
          value={country}
          onChange={(event) => {
            if (isCountryCode(event.target.value)) setCountry(event.target.value);
          }}
          className={inputClass}
        >
          {COUNTRY_CODES.map((code) => (
            <option key={code} value={code}>
              {COUNTRY_DEFAULTS[code].name}
            </option>
          ))}
        </select>
      </Field>

      <div className="border-border bg-muted/30 grid grid-cols-3 gap-4 rounded-md border p-4 text-sm">
        <Derived label="Currency" value={defaults.currency} />
        <Derived label="Locale" value={defaults.locale} />
        <Derived label="Timezone" value={defaults.timezone} />
      </div>

      <Field label="Address line 1">
        <input
          type="text"
          required
          value={line1}
          onChange={(event) => setLine1(event.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="City">
          <input
            type="text"
            required
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="State / region">
          <input
            type="text"
            value={state}
            onChange={(event) => setState(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Postal code">
        <input
          type="text"
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
          className={inputClass}
        />
      </Field>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? 'Creating restaurant…' : 'Continue'}
      </button>
    </form>
  );
}

const inputClass =
  'border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </label>
  );
}

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="text-foreground font-mono text-sm">{value}</p>
    </div>
  );
}
