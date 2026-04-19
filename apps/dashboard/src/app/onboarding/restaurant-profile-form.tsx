'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
} from '@menukaze/ui';
import { createRestaurantAction } from '@/app/actions/onboarding';

// Currency is locked at creation; locale/timezone can be overridden later.
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

// Matches the slugSchema rules in @menukaze/shared.
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
        <Input
          type="text"
          required
          minLength={1}
          maxLength={120}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
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
        <div className="border-input bg-surface flex items-center rounded-lg border">
          <Input
            type="text"
            required
            minLength={2}
            maxLength={64}
            pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
            className="flex-1 rounded-r-none border-0 bg-transparent shadow-none focus:ring-0"
          />
          <span className="text-muted-foreground border-input border-l px-3 text-sm">
            .menukaze.com
          </span>
        </div>
      </Field>

      <Field label="Country" hint="Locks in currency, locale, tax format, and time zone.">
        <Select
          required
          value={country}
          onChange={(event) => {
            if (isCountryCode(event.target.value)) setCountry(event.target.value);
          }}
        >
          {COUNTRY_CODES.map((code) => (
            <option key={code} value={code}>
              {COUNTRY_DEFAULTS[code].name}
            </option>
          ))}
        </Select>
      </Field>

      <Card variant="subtle" radius="sm">
        <CardContent className="grid grid-cols-1 gap-4 p-4 text-sm sm:grid-cols-3">
          <Derived label="Currency" value={defaults.currency} />
          <Derived label="Locale" value={defaults.locale} />
          <Derived label="Timezone" value={defaults.timezone} />
        </CardContent>
      </Card>

      <Field label="Address line 1">
        <Input
          type="text"
          required
          value={line1}
          onChange={(event) => setLine1(event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="City">
          <Input
            type="text"
            required
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </Field>

        <Field label="State / region">
          <Input type="text" value={state} onChange={(event) => setState(event.target.value)} />
        </Field>
      </div>

      <Field label="Postal code">
        <Input
          type="text"
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={pending} full loading={pending}>
        Continue
      </Button>
    </form>
  );
}

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
    <label className="block space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </label>
  );
}

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
      <p className="text-foreground font-mono text-sm">{value}</p>
    </div>
  );
}
