'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateProfileAction,
  updateHoursAction,
  updateHolidayModeAction,
  updateThrottlingAction,
  updateDeliverySettingsAction,
  updateQrDineInSettingsAction,
  updateReceiptBrandingAction,
  updateNotificationPrefsAction,
} from '@/app/actions/settings';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const DAY_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const satisfies readonly DayKey[];

interface DayHours {
  day: DayKey;
  closed: boolean;
  open: string;
  close: string;
}

interface InitialSettings {
  name: string;
  description: string;
  email: string;
  phone: string;
  logoUrl: string;
  delivery: {
    estimatedPrepMinutes: number;
    minimumOrderMinor: number;
    deliveryFeeMinor: number;
  };
  qrDineIn: {
    dineInSessionTimeoutMinutes: number;
  };
  addressStructured: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  hours: DayHours[];
  holidayMode: { enabled: boolean; message: string };
  throttling: { enabled: boolean; maxConcurrentOrders: number };
  receiptBranding: { headerColor: string; footerText: string; socials: string[] };
  notificationPrefs: { email: boolean; dashboard: boolean; sound: boolean };
}

const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export function SettingsClient({ initial }: { initial: InitialSettings }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToast(`Saved ${label}`);
      window.setTimeout(() => setToast(null), 1500);
      router.refresh();
    });
  }

  return (
    <>
      {toast ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{toast}</p>
      ) : null}
      {error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
      ) : null}

      <ProfileSection
        initial={initial}
        pending={isPending}
        onSubmit={(payload) => run('profile', () => updateProfileAction(payload))}
      />
      <DeliverySection
        initial={initial.delivery}
        pending={isPending}
        onSubmit={(payload) => run('delivery', () => updateDeliverySettingsAction(payload))}
      />
      <QrDineInSection
        initial={initial.qrDineIn}
        pending={isPending}
        onSubmit={(payload) => run('QR dine-in', () => updateQrDineInSettingsAction(payload))}
      />
      <HoursSection
        initial={initial.hours}
        pending={isPending}
        onSubmit={(hours) => run('hours', () => updateHoursAction({ hours }))}
      />
      <HolidaySection
        initial={initial.holidayMode}
        pending={isPending}
        onSubmit={(payload) => run('holiday mode', () => updateHolidayModeAction(payload))}
      />
      <ThrottlingSection
        initial={initial.throttling}
        pending={isPending}
        onSubmit={(payload) => run('throttling', () => updateThrottlingAction(payload))}
      />
      <BrandingSection
        initial={initial.receiptBranding}
        pending={isPending}
        onSubmit={(payload) => run('receipt branding', () => updateReceiptBrandingAction(payload))}
      />
      <NotificationsSection
        initial={initial.notificationPrefs}
        pending={isPending}
        onSubmit={(payload) => run('notifications', () => updateNotificationPrefsAction(payload))}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border rounded-lg border p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function InputRow({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      />
    </label>
  );
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground mt-2 h-9 self-start rounded-md px-4 text-sm font-medium disabled:opacity-50"
    >
      Save
    </button>
  );
}

function ProfileSection({
  initial,
  pending,
  onSubmit,
}: {
  initial: InitialSettings;
  pending: boolean;
  onSubmit: (payload: {
    name: string;
    description?: string;
    email?: string;
    phone?: string;
    logoUrl?: string;
    addressStructured: InitialSettings['addressStructured'];
  }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [addr, setAddr] = useState(initial.addressStructured);
  return (
    <Section title="Profile">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name,
            description: description || undefined,
            email: email || undefined,
            phone: phone || undefined,
            logoUrl: logoUrl || undefined,
            addressStructured: {
              ...addr,
              line2: addr.line2 || '',
              state: addr.state || '',
              postalCode: addr.postalCode || '',
            },
          });
        }}
        className="flex flex-col gap-3"
      >
        <InputRow label="Name" value={name} onChange={setName} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground">Description (shown on storefront hero)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <InputRow label="Public email" value={email} onChange={setEmail} type="email" />
        <InputRow label="Phone" value={phone} onChange={setPhone} />
        <InputRow label="Logo URL" value={logoUrl} onChange={setLogoUrl} />
        <InputRow
          label="Address line 1"
          value={addr.line1}
          onChange={(v) => setAddr({ ...addr, line1: v })}
        />
        <InputRow
          label="Address line 2"
          value={addr.line2}
          onChange={(v) => setAddr({ ...addr, line2: v })}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputRow
            label="City"
            value={addr.city}
            onChange={(v) => setAddr({ ...addr, city: v })}
          />
          <InputRow
            label="State"
            value={addr.state}
            onChange={(v) => setAddr({ ...addr, state: v })}
          />
          <InputRow
            label="Postal code"
            value={addr.postalCode}
            onChange={(v) => setAddr({ ...addr, postalCode: v })}
          />
          <InputRow
            label="Country (ISO2)"
            value={addr.country}
            onChange={(v) => setAddr({ ...addr, country: v.toUpperCase() })}
          />
        </div>
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function DeliverySection({
  initial,
  pending,
  onSubmit,
}: {
  initial: InitialSettings['delivery'];
  pending: boolean;
  onSubmit: (payload: InitialSettings['delivery']) => void;
}) {
  const [prep, setPrep] = useState(String(initial.estimatedPrepMinutes));
  const [minOrderMajor, setMinOrderMajor] = useState((initial.minimumOrderMinor / 100).toFixed(2));
  const [deliveryFeeMajor, setDeliveryFeeMajor] = useState(
    (initial.deliveryFeeMinor / 100).toFixed(2),
  );

  return (
    <Section title="Delivery & prep time">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            estimatedPrepMinutes: Number.parseInt(prep, 10) || 20,
            minimumOrderMinor: Math.round(Number.parseFloat(minOrderMajor || '0') * 100),
            deliveryFeeMinor: Math.round(Number.parseFloat(deliveryFeeMajor || '0') * 100),
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-center gap-3 text-sm">
          <span className="w-48">Estimated prep time (minutes)</span>
          <input
            type="number"
            min="1"
            max="600"
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
            className="border-input bg-background h-9 w-24 rounded-md border px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-48">Minimum order (0 = disabled)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={minOrderMajor}
            onChange={(e) => setMinOrderMajor(e.target.value)}
            className="border-input bg-background h-9 w-28 rounded-md border px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-48">Delivery fee (flat)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={deliveryFeeMajor}
            onChange={(e) => setDeliveryFeeMajor(e.target.value)}
            className="border-input bg-background h-9 w-28 rounded-md border px-2 text-sm"
          />
        </label>
        <p className="text-muted-foreground text-xs">
          Zone-based delivery and in-store preparation timers ship post-MVP (§20 deferred list).
        </p>
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function HoursSection({
  initial,
  pending,
  onSubmit,
}: {
  initial: DayHours[];
  pending: boolean;
  onSubmit: (hours: DayHours[]) => void;
}) {
  const [hours, setHours] = useState<DayHours[]>(
    DAY_KEYS.map((day) => {
      const existing = initial.find((h) => h.day === day);
      return existing ?? { day, closed: false, open: '09:00', close: '22:00' };
    }),
  );

  return (
    <Section title="Hours">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(hours);
        }}
        className="flex flex-col gap-2"
      >
        {hours.map((h, i) => (
          <div key={h.day} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-10 uppercase">{DAY_LABEL[h.day]}</span>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={!h.closed}
                onChange={(e) => {
                  const next = [...hours];
                  next[i] = { ...h, closed: !e.target.checked };
                  setHours(next);
                }}
              />
              Open
            </label>
            <input
              type="time"
              value={h.open}
              disabled={h.closed}
              onChange={(e) => {
                const next = [...hours];
                next[i] = { ...h, open: e.target.value };
                setHours(next);
              }}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs disabled:opacity-50"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="time"
              value={h.close}
              disabled={h.closed}
              onChange={(e) => {
                const next = [...hours];
                next[i] = { ...h, close: e.target.value };
                setHours(next);
              }}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs disabled:opacity-50"
            />
          </div>
        ))}
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function QrDineInSection({
  initial,
  pending,
  onSubmit,
}: {
  initial: InitialSettings['qrDineIn'];
  pending: boolean;
  onSubmit: (payload: InitialSettings['qrDineIn']) => void;
}) {
  const [timeoutMinutes, setTimeoutMinutes] = useState(String(initial.dineInSessionTimeoutMinutes));

  return (
    <Section title="QR dine-in">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            dineInSessionTimeoutMinutes: Number.parseInt(timeoutMinutes, 10) || 180,
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-center gap-3 text-sm">
          <span className="w-52">Session timeout (minutes)</span>
          <input
            type="number"
            min="30"
            max="720"
            step="15"
            value={timeoutMinutes}
            onChange={(e) => setTimeoutMinutes(e.target.value)}
            className="border-input bg-background h-9 w-24 rounded-md border px-2 text-sm"
          />
        </label>
        <p className="text-muted-foreground text-xs">
          Guests are warned 15 minutes before expiry. Unpaid timed-out sessions move the table to
          Needs Review instead of releasing it automatically.
        </p>
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function HolidaySection({
  initial,
  pending,
  onSubmit,
}: {
  initial: { enabled: boolean; message: string };
  pending: boolean;
  onSubmit: (payload: { enabled: boolean; message?: string }) => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [message, setMessage] = useState(initial.message);
  return (
    <Section title="Holiday mode">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ enabled, message: message || undefined });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Block new orders (storefront shows holiday message)
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Holiday message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="border-input bg-background h-20 rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function ThrottlingSection({
  initial,
  pending,
  onSubmit,
}: {
  initial: { enabled: boolean; maxConcurrentOrders: number };
  pending: boolean;
  onSubmit: (payload: { enabled: boolean; maxConcurrentOrders: number }) => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [max, setMax] = useState(initial.maxConcurrentOrders);
  return (
    <Section title="Order throttling">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ enabled, maxConcurrentOrders: max });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Cap active orders when the kitchen is busy
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>Max concurrent orders</span>
          <input
            type="number"
            min="1"
            max="500"
            value={max}
            onChange={(e) => setMax(Number.parseInt(e.target.value, 10) || 1)}
            disabled={!enabled}
            className="border-input bg-background h-8 w-20 rounded-md border px-2 text-sm disabled:opacity-50"
          />
        </label>
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function BrandingSection({
  initial,
  pending,
  onSubmit,
}: {
  initial: { headerColor: string; footerText: string; socials: string[] };
  pending: boolean;
  onSubmit: (payload: { headerColor?: string; footerText?: string; socials: string[] }) => void;
}) {
  const [headerColor, setHeaderColor] = useState(initial.headerColor);
  const [footerText, setFooterText] = useState(initial.footerText);
  const [socialsCsv, setSocialsCsv] = useState(initial.socials.join('\n'));
  return (
    <Section title="Receipt branding">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            headerColor,
            footerText: footerText || undefined,
            socials: socialsCsv
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex items-center gap-3 text-sm">
          <span>Header color</span>
          <input
            type="color"
            value={headerColor}
            onChange={(e) => setHeaderColor(e.target.value)}
            className="h-8 w-14 rounded border"
          />
          <span className="text-muted-foreground font-mono text-xs">{headerColor}</span>
        </label>
        <InputRow label="Footer text" value={footerText} onChange={setFooterText} />
        <label className="flex flex-col gap-1 text-sm">
          <span>Social URLs (one per line)</span>
          <textarea
            value={socialsCsv}
            onChange={(e) => setSocialsCsv(e.target.value)}
            className="border-input bg-background h-20 rounded-md border px-3 py-2 font-mono text-sm"
          />
        </label>
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}

function NotificationsSection({
  initial,
  pending,
  onSubmit,
}: {
  initial: { email: boolean; dashboard: boolean; sound: boolean };
  pending: boolean;
  onSubmit: (payload: { email: boolean; dashboard: boolean; sound: boolean }) => void;
}) {
  const [prefs, setPrefs] = useState(initial);
  return (
    <Section title="Notifications">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(prefs);
        }}
        className="flex flex-col gap-2"
      >
        {(['email', 'dashboard', 'sound'] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm capitalize">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
            />
            {key === 'dashboard' ? 'Dashboard alerts' : `${key}`}
          </label>
        ))}
        <SaveButton pending={pending} />
      </form>
    </Section>
  );
}
