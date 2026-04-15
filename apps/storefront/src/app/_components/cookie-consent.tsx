'use client';

import { useEffect, useState } from 'react';

const CONSENT_COOKIE = 'mk_consent';
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_DAYS = 180;

interface Consent {
  v: number;
  necessary: true;
  performance: boolean;
  functional: boolean;
  targeting: boolean;
  ts: number;
}

const DEFAULT_CONSENT: Consent = {
  v: CONSENT_VERSION,
  necessary: true,
  performance: false,
  functional: false,
  targeting: false,
  ts: 0,
};

function readConsent(): Consent | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1));
    const parsed = JSON.parse(value) as Consent;
    if (parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(consent: Consent): void {
  const value = encodeURIComponent(JSON.stringify(consent));
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent('mk:consent-updated', { detail: consent }));
}

const PREFS_EVENT = 'mk:open-cookie-prefs';

/**
 * Granular cookie consent banner. Categories: strictly necessary (always on),
 * performance, functional, targeting. Until the user picks, only strictly
 * necessary cookies (cart session, consent itself) should be set.
 *
 * Re-open from the footer "Cookie preferences" link, which dispatches the
 * `mk:open-cookie-prefs` event.
 */
export function CookieConsent() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [draft, setDraft] = useState<Consent>(DEFAULT_CONSENT);

  useEffect(() => {
    const existing = readConsent();
    setConsent(existing);
    if (!existing) {
      setOpen(true);
      setDraft(DEFAULT_CONSENT);
    }
    const onOpen = (): void => {
      const current = readConsent() ?? DEFAULT_CONSENT;
      setDraft(current);
      setShowDetails(true);
      setOpen(true);
    };
    window.addEventListener(PREFS_EVENT, onOpen);
    return () => window.removeEventListener(PREFS_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const acceptAll = (): void => {
    const next: Consent = {
      v: CONSENT_VERSION,
      necessary: true,
      performance: true,
      functional: true,
      targeting: true,
      ts: Date.now(),
    };
    writeConsent(next);
    setConsent(next);
    setOpen(false);
  };

  const rejectNonEssential = (): void => {
    const next: Consent = { ...DEFAULT_CONSENT, ts: Date.now() };
    writeConsent(next);
    setConsent(next);
    setOpen(false);
  };

  const saveCustom = (): void => {
    const next: Consent = { ...draft, necessary: true, ts: Date.now() };
    writeConsent(next);
    setConsent(next);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="border-border bg-background fixed inset-x-0 bottom-0 z-50 border-t shadow-2xl"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="cookie-consent-title" className="text-base font-semibold">
            Cookie preferences
          </h2>
          <p className="text-muted-foreground text-sm">
            We use cookies to keep your cart working and to understand how the site is used. You can
            accept all, reject non-essential, or pick what to allow. Read more in our{' '}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {showDetails ? (
          <fieldset className="border-border grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
            <legend className="text-muted-foreground px-1 text-xs font-semibold uppercase tracking-wide">
              Categories
            </legend>
            <Toggle
              label="Strictly necessary"
              description="Cart, checkout, security. Always on."
              checked
              disabled
              onChange={() => undefined}
            />
            <Toggle
              label="Performance"
              description="Anonymous usage analytics to improve the site."
              checked={draft.performance}
              onChange={(v) => setDraft({ ...draft, performance: v })}
            />
            <Toggle
              label="Functional"
              description="Remember preferences such as language and saved addresses."
              checked={draft.functional}
              onChange={(v) => setDraft({ ...draft, functional: v })}
            />
            <Toggle
              label="Targeting"
              description="Personalised offers and ads outside this site."
              checked={draft.targeting}
              onChange={(v) => setDraft({ ...draft, targeting: v })}
            />
          </fieldset>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!showDetails ? (
            <button
              type="button"
              onClick={() => {
                setDraft(consent ?? DEFAULT_CONSENT);
                setShowDetails(true);
              }}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
            >
              Customize
            </button>
          ) : null}
          <button
            type="button"
            onClick={rejectNonEssential}
            className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Reject non-essential
          </button>
          {showDetails ? (
            <button
              type="button"
              onClick={saveCustom}
              className="border-border hover:bg-muted inline-flex h-9 items-center rounded-md border px-3 text-sm"
            >
              Save preferences
            </button>
          ) : null}
          <button
            type="button"
            onClick={acceptAll}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ label, description, checked, disabled, onChange }: ToggleProps) {
  return (
    <label className="hover:bg-muted/40 flex items-start gap-3 rounded-md p-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
    </label>
  );
}

/**
 * Footer link that re-opens the cookie preferences panel.
 */
export function CookiePreferencesLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(PREFS_EVENT))}
      className={className ?? 'hover:text-foreground underline-offset-2 hover:underline'}
    >
      Cookie preferences
    </button>
  );
}
