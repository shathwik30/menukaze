import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireAnyPageFlag } from '@/lib/session';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { restaurantId, permissions } = await requireAnyPageFlag([
    'settings.edit_profile',
    'settings.edit_hours',
    'settings.toggle_holiday',
    'settings.edit_delivery',
    'settings.edit_branding',
    'settings.edit_notifications',
  ]);
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) notFound();

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--mk-saffron-700)',
              marginBottom: 8,
            }}
          >
            Workspace
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              color: 'var(--mk-ink-950)',
            }}
          >
            Settings
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)' }}>
            {restaurant.name}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            href="/admin/settings/sessions"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--mk-ink-600)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Devices &amp; sessions
          </Link>
          <Link
            href="/admin"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--mk-ink-500)',
              textDecoration: 'none',
            }}
          >
            ← Back
          </Link>
        </div>
      </div>

      <div style={{ padding: '24px 40px 48px', maxWidth: 780 }}>
        <SettingsClient
          initial={{
            name: restaurant.name,
            description: restaurant.description ?? '',
            email: restaurant.email ?? '',
            phone: restaurant.phone ?? '',
            logoUrl: restaurant.logoUrl ?? '',
            delivery: {
              estimatedPrepMinutes: restaurant.estimatedPrepMinutes ?? 20,
              minimumOrderMinor: restaurant.minimumOrderMinor ?? 0,
              deliveryFeeMinor: restaurant.deliveryFeeMinor ?? 0,
            },
            qrDineIn: {
              dineInSessionTimeoutMinutes: restaurant.dineInSessionTimeoutMinutes ?? 180,
            },
            addressStructured: {
              line1: restaurant.addressStructured.line1,
              line2: restaurant.addressStructured.line2 ?? '',
              city: restaurant.addressStructured.city,
              state: restaurant.addressStructured.state ?? '',
              postalCode: restaurant.addressStructured.postalCode ?? '',
              country: restaurant.addressStructured.country,
            },
            hours: restaurant.hours.map((h) => ({
              day: h.day,
              closed: h.closed,
              open: h.open ?? '',
              close: h.close ?? '',
            })),
            holidayMode: {
              enabled: restaurant.holidayMode?.enabled ?? false,
              message: restaurant.holidayMode?.message ?? '',
            },
            throttling: {
              enabled: restaurant.throttling?.enabled ?? false,
              maxConcurrentOrders: restaurant.throttling?.maxConcurrentOrders ?? 20,
            },
            geolocationRestriction: {
              enabled: restaurant.geolocationRestriction?.enabled ?? false,
              radiusKm: restaurant.geolocationRestriction?.radiusKm ?? 5,
            },
            receiptBranding: {
              headerColor: restaurant.receiptBranding?.headerColor ?? '#000000',
              footerText: restaurant.receiptBranding?.footerText ?? '',
              socials: restaurant.receiptBranding?.socials ?? [],
            },
            notificationPrefs: {
              email: restaurant.notificationPrefs?.email ?? true,
              dashboard: restaurant.notificationPrefs?.dashboard ?? true,
              sound: restaurant.notificationPrefs?.sound ?? true,
            },
            taxRules: (restaurant.taxRules ?? []).map((r) => ({
              name: r.name,
              percent: r.percent,
              inclusive: r.inclusive,
              label: r.label,
            })),
            taxClasses: (restaurant.taxClasses ?? []).map((taxClass) => ({
              id: taxClass.id,
              name: taxClass.name,
              rules: (taxClass.rules ?? []).map((rule) => ({
                name: rule.name,
                percent: rule.percent,
                inclusive: rule.inclusive,
                label: rule.label,
              })),
            })),
          }}
          permissions={{
            canEditProfile: permissions.includes('settings.edit_profile'),
            canEditHours: permissions.includes('settings.edit_hours'),
            canToggleHoliday: permissions.includes('settings.toggle_holiday'),
            canEditDelivery: permissions.includes('settings.edit_delivery'),
            canEditBranding: permissions.includes('settings.edit_branding'),
            canEditNotifications: permissions.includes('settings.edit_notifications'),
          }}
        />
      </div>
    </div>
  );
}
