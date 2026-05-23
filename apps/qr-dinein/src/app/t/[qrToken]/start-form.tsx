'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parsePhoneNumberWithError, ParseError } from 'libphonenumber-js';
import { haversineMeters } from '@menukaze/shared';
import { Button, Card, FieldError, Input, Label, cn } from '@menukaze/ui';
import { startOrJoinSessionAction } from '@/app/actions/session';

const HINT_KEY = 'mk_dinein_hint';

function readOrCreateClientHint(): string {
  if (typeof window === 'undefined') return '';
  let value = window.localStorage.getItem(HINT_KEY);
  if (!value) {
    const random =
      window.crypto?.randomUUID?.() ??
      `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    value = random;
    window.localStorage.setItem(HINT_KEY, value);
  }
  return value;
}

function requestCoords(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  if (typeof window === 'undefined' || !window.navigator?.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: { lat: number; lng: number } | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
    setTimeout(() => done(null), timeoutMs + 200);
  });
}

type LocationGateStatus =
  | 'not_required'
  | 'checking'
  | 'granted'
  | 'outside_range'
  | 'blocked'
  | 'unsupported';

interface Coordinates {
  lat: number;
  lng: number;
}

// ── Country dial codes ──────────────────────────────────────────────────────

interface DialCountry {
  code: string;
  dial: string;
  name: string;
}

const DIAL_COUNTRIES: DialCountry[] = [
  { code: 'IN', dial: '+91', name: 'India' },
  { code: 'US', dial: '+1', name: 'United States' },
  { code: 'GB', dial: '+44', name: 'United Kingdom' },
  { code: 'AE', dial: '+971', name: 'UAE' },
  { code: 'SG', dial: '+65', name: 'Singapore' },
  { code: 'AU', dial: '+61', name: 'Australia' },
  { code: 'CA', dial: '+1', name: 'Canada' },
  { code: 'DE', dial: '+49', name: 'Germany' },
  { code: 'FR', dial: '+33', name: 'France' },
  { code: 'IT', dial: '+39', name: 'Italy' },
  { code: 'ES', dial: '+34', name: 'Spain' },
  { code: 'NL', dial: '+31', name: 'Netherlands' },
  { code: 'JP', dial: '+81', name: 'Japan' },
  { code: 'KR', dial: '+82', name: 'South Korea' },
  { code: 'CN', dial: '+86', name: 'China' },
  { code: 'HK', dial: '+852', name: 'Hong Kong' },
  { code: 'MY', dial: '+60', name: 'Malaysia' },
  { code: 'ID', dial: '+62', name: 'Indonesia' },
  { code: 'PH', dial: '+63', name: 'Philippines' },
  { code: 'TH', dial: '+66', name: 'Thailand' },
  { code: 'VN', dial: '+84', name: 'Vietnam' },
  { code: 'PK', dial: '+92', name: 'Pakistan' },
  { code: 'BD', dial: '+880', name: 'Bangladesh' },
  { code: 'LK', dial: '+94', name: 'Sri Lanka' },
  { code: 'NP', dial: '+977', name: 'Nepal' },
  { code: 'SA', dial: '+966', name: 'Saudi Arabia' },
  { code: 'QA', dial: '+974', name: 'Qatar' },
  { code: 'KW', dial: '+965', name: 'Kuwait' },
  { code: 'BH', dial: '+973', name: 'Bahrain' },
  { code: 'OM', dial: '+968', name: 'Oman' },
  { code: 'BR', dial: '+55', name: 'Brazil' },
  { code: 'MX', dial: '+52', name: 'Mexico' },
  { code: 'ZA', dial: '+27', name: 'South Africa' },
  { code: 'NG', dial: '+234', name: 'Nigeria' },
  { code: 'KE', dial: '+254', name: 'Kenya' },
  { code: 'NZ', dial: '+64', name: 'New Zealand' },
];

function flagEmoji(code: string): string {
  // Regional indicator symbols: A=0x1F1E6 … Z=0x1F1FF
  const offset = 0x1f1e6;
  return String.fromCodePoint(
    offset + (code.charCodeAt(0) - 65),
    offset + (code.charCodeAt(1) - 65),
  );
}

// ── Phone input with dial-code picker ────────────────────────────────────────

function validatePhone(dialCode: string, localNumber: string): string | null {
  if (!localNumber.trim()) return null; // optional field — empty is fine
  try {
    const full = `${dialCode}${localNumber.replace(/\D/g, '')}`;
    const parsed = parsePhoneNumberWithError(full);
    return parsed.isValid() ? null : `Invalid number for ${dialCode}`;
  } catch (err) {
    if (err instanceof ParseError) {
      return err.message === 'TOO_SHORT'
        ? 'Number is too short'
        : err.message === 'TOO_LONG'
          ? 'Number is too long'
          : `Invalid number for ${dialCode}`;
    }
    return `Invalid number for ${dialCode}`;
  }
}

function PhoneInputField({
  value,
  onChange,
  onValidationChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onValidationChange: (error: string | null) => void;
}) {
  const [dialCode, setDialCode] = useState('+91');
  const [localNumber, setLocalNumber] = useState('');
  const [touched, setTouched] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 240,
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function validateNumber(code: string, num: string) {
    const err = validatePhone(code, num);
    setPhoneError(err);
    onValidationChange(err);
  }

  // Keep parent value in sync
  useEffect(() => {
    const combined = localNumber.trim() ? `${dialCode} ${localNumber.trim()}` : '';
    if (combined !== value) onChange(combined);
  }, [dialCode, localNumber]);

  // Position dropdown using fixed coords so it escapes any overflow:hidden parent
  function openPicker() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
      });
    }
    setPickerOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const insideButton = buttonRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideButton && !insideDropdown) {
        setPickerOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search when picker opens
  useEffect(() => {
    if (pickerOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [pickerOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return DIAL_COUNTRIES;
    const q = search.toLowerCase();
    return DIAL_COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q));
  }, [search]);

  const selected = DIAL_COUNTRIES.find((c) => c.dial === dialCode) ?? DIAL_COUNTRIES[0]!;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {/* Dial code picker button */}
        <div className="shrink-0">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => (pickerOpen ? (setPickerOpen(false), setSearch('')) : openPicker())}
            className={cn(
              'border-ink-200 bg-surface flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
              pickerOpen ? 'border-ink-400 ring-ink-950/8 ring-2' : 'hover:border-ink-300',
            )}
          >
            <span className="text-base leading-none">{flagEmoji(selected.code)}</span>
            <span className="text-ink-700 font-mono text-xs">{selected.dial}</span>
            <ChevronDownIcon className="text-ink-400 size-3" />
          </button>

          {pickerOpen ? (
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                width: dropdownStyle.width,
                zIndex: 9999,
              }}
              className="border-ink-200 shadow-ink-950/10 overflow-hidden rounded-md border bg-white shadow-lg"
            >
              {/* Search */}
              <div className="border-ink-100 border-b px-2 py-1.5">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search country…"
                  className="text-ink-900 placeholder:text-ink-400 bg-canvas-50 w-full rounded-sm px-2 py-1.5 text-sm outline-none"
                />
              </div>
              {/* Country list */}
              <ul className="max-h-48 overflow-y-auto py-0.5">
                {filtered.map((country) => (
                  <li key={`${country.code}-${country.dial}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setDialCode(country.dial);
                        setPickerOpen(false);
                        setSearch('');
                        if (touched) validateNumber(country.dial, localNumber);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                        country.dial === dialCode
                          ? 'bg-ink-950 text-white'
                          : 'text-ink-700 hover:bg-canvas-50',
                      )}
                    >
                      <span className="text-base leading-none">{flagEmoji(country.code)}</span>
                      <span className="min-w-0 flex-1 truncate">{country.name}</span>
                      <span
                        className={cn(
                          'font-mono text-xs',
                          country.dial === dialCode ? 'text-ink-300' : 'text-ink-400',
                        )}
                      >
                        {country.dial}
                      </span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 ? (
                  <li className="text-ink-400 px-3 py-2.5 text-sm">No country found</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Local number */}
        <Input
          type="tel"
          value={localNumber}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d\s\-().]/g, '');
            setLocalNumber(v);
            if (touched) validateNumber(dialCode, v);
          }}
          onBlur={() => {
            setTouched(true);
            validateNumber(dialCode, localNumber);
          }}
          placeholder="98765 43210"
          autoComplete="tel-national"
          className="flex-1"
          inputMode="tel"
        />
      </div>
      {phoneError ? <p className="text-mkrose-600 text-xs font-medium">{phoneError}</p> : null}
    </div>
  );
}

// ── Start session form ────────────────────────────────────────────────────────

export function StartSessionForm({
  qrToken,
  geolocationEnabled,
  restaurantLocation,
  radiusKm,
}: {
  qrToken: string;
  geolocationEnabled: boolean;
  restaurantLocation: Coordinates;
  radiusKm: number;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationGateStatus, setLocationGateStatus] = useState<LocationGateStatus>(
    geolocationEnabled ? 'checking' : 'not_required',
  );
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [clientHint, setClientHint] = useState('');

  const requestRequiredLocation = useCallback(async () => {
    if (!geolocationEnabled) {
      setLocationGateStatus('not_required');
      setCoords(null);
      setDistanceM(null);
      return;
    }

    setError(null);
    setLocationGateStatus('checking');
    setDistanceM(null);
    const nextCoords = await requestCoords();
    if (!nextCoords) {
      setCoords(null);
      setLocationGateStatus(
        typeof window === 'undefined' || !window.navigator?.geolocation ? 'unsupported' : 'blocked',
      );
      return;
    }

    const nextDistanceM = haversineMeters(restaurantLocation, nextCoords);
    setDistanceM(nextDistanceM);
    setCoords(nextCoords);
    setLocationGateStatus(nextDistanceM <= radiusKm * 1000 ? 'granted' : 'outside_range');
  }, [geolocationEnabled, radiusKm, restaurantLocation]);

  useEffect(() => {
    setClientHint(readOrCreateClientHint());
  }, []);

  useEffect(() => {
    void requestRequiredLocation();
  }, [requestRequiredLocation]);

  const locationBlocked = geolocationEnabled && locationGateStatus !== 'granted';
  const submitDisabled = isPending || Boolean(phoneError) || locationBlocked;

  return (
    <Card className="p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneError) return; // block if phone entered but invalid
          if (geolocationEnabled && (!coords || locationGateStatus !== 'granted')) {
            setError('This restaurant requires you to be within the allowed ordering range.');
            return;
          }
          setError(null);
          start(async () => {
            const trimmedPhone = phone.trim();
            const result = await startOrJoinSessionAction(
              qrToken,
              { name, email, ...(trimmedPhone ? { phone: trimmedPhone } : {}) },
              { ...(coords ? { coords } : {}), clientHint },
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push(`/session/${result.sessionId}`);
          });
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-ink-500 text-sm">
          Start your dine-in order. We&apos;ll email you a receipt at the end.
        </p>

        {geolocationEnabled ? (
          <div className="border-ink-100 bg-canvas-50 rounded-lg border p-3 text-sm">
            {locationGateStatus === 'checking' ? (
              <p className="text-ink-600">
                Checking your location. This restaurant requires location access to confirm you are
                at the table.
              </p>
            ) : locationGateStatus === 'granted' ? (
              <p className="text-jade-700">
                Location confirmed. You are within {radiusKm} km of the restaurant.
              </p>
            ) : locationGateStatus === 'outside_range' ? (
              <div className="flex flex-col gap-2">
                <p className="text-mkrose-700">
                  You are outside this restaurant&apos;s {radiusKm} km ordering range
                  {distanceM !== null ? ` (${(distanceM / 1000).toFixed(1)} km away)` : ''}. Please
                  order when you are at the restaurant.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => void requestRequiredLocation()}
                >
                  Check location again
                </Button>
              </div>
            ) : locationGateStatus === 'unsupported' ? (
              <p className="text-mkrose-700">
                This browser does not support location access, so ordering is disabled for this
                restaurant.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-mkrose-700">
                  This restaurant requires location access before ordering. If the browser does not
                  show a permission popup, click the site icon in the address bar and change
                  Location to Allow, then try again.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => void requestRequiredLocation()}
                >
                  Allow location
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <Label>
            Phone <span className="text-ink-400 text-xs font-normal">(optional)</span>
          </Label>
          <PhoneInputField value={phone} onChange={setPhone} onValidationChange={setPhoneError} />
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button type="submit" disabled={submitDisabled} loading={isPending} className="mt-1">
          {locationGateStatus === 'checking' ? 'Checking location...' : 'Start ordering'}
        </Button>
      </form>
    </Card>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
