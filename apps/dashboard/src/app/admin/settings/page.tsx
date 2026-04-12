import { Types } from 'mongoose';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm">{restaurant.name}</p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

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
        }}
      />
    </main>
  );
}
