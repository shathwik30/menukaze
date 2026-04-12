import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import { requireOnboardedRestaurant } from '@/lib/session';
import { computeChecklist } from '@/lib/onboarding-checklist';
import { signOutAction } from '@/app/actions/auth';
import { OnboardingChecklistCard } from './onboarding-checklist-card';

export const dynamic = 'force-dynamic';

export default async function DashboardAdminPage() {
  const { session, restaurantId } = await requireOnboardedRestaurant();

  // Load the restaurant for the header. Bypasses the tenant guard because we
  // pass an explicit _id filter — there's nothing tenant-scoped about
  // looking up the tenant root by primary key.
  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item, Table } = getModels(conn);
  const [restaurant, menus, categories, items, tables] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Menu.find({ restaurantId }).sort({ order: 1 }).exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).exec(),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';
  const slug = restaurant?.slug ?? 'demo';
  const firstTable = tables[0];
  const hasPermission = (flag: (typeof session.permissions)[number]) =>
    session.permissions.includes(flag);
  const canViewSettings = session.permissions.some((flag) => flag.startsWith('settings.'));
  const canViewStaff = hasPermission('staff.view');
  const canEditMenu = hasPermission('menu.edit');
  const canPrintQr = hasPermission('tables.qr_print');
  const navLinks = [
    { href: '/admin/orders', label: 'Orders', visible: hasPermission('orders.view_all') },
    { href: '/admin/kds', label: 'KDS', visible: hasPermission('kds.view') },
    { href: '/admin/menu', label: 'Menu', visible: hasPermission('menu.view') },
    { href: '/admin/tables', label: 'Tables', visible: hasPermission('tables.view') },
    { href: '/admin/settings', label: 'Settings', visible: canViewSettings },
    { href: '/admin/staff', label: 'Staff', visible: canViewStaff },
  ];

  // Post-onboarding checklist — only rendered if the user hasn't dismissed it.
  const showChecklist = restaurant && !restaurant.checklistDismissed && canViewSettings;
  const checklist = restaurant ? computeChecklist(restaurant, items, tables) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{restaurant?.name ?? 'Menukaze'}</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as <span className="text-foreground font-medium">{session.user.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {navLinks
            .filter((link) => link.visible)
            .map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm"
              >
                {link.label}
              </Link>
            ))}
          <form action={signOutAction}>
            <button
              type="submit"
              className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {showChecklist && checklist ? <OnboardingChecklistCard checklist={checklist} /> : null}

      <section className="border-border rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Restaurant profile</h2>
        <dl className="text-muted-foreground mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt>Slug</dt>
          <dd className="text-foreground font-mono">{restaurant?.slug}</dd>
          <dt>Country</dt>
          <dd className="text-foreground">{restaurant?.country}</dd>
          <dt>Currency</dt>
          <dd className="text-foreground">{restaurant?.currency}</dd>
          <dt>Locale</dt>
          <dd className="text-foreground">{restaurant?.locale}</dd>
          <dt>Timezone</dt>
          <dd className="text-foreground">{restaurant?.timezone}</dd>
          <dt>Subscription</dt>
          <dd className="text-foreground">{restaurant?.subscriptionStatus}</dd>
          <dt>Razorpay</dt>
          <dd className="text-foreground">
            {restaurant?.razorpayKeyIdEnc ? (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Connected <span className="text-muted-foreground">(test mode)</span>
              </span>
            ) : hasPermission('payments.configure') ? (
              <Link href="/onboarding/razorpay" className="text-foreground underline">
                Not connected — set up
              </Link>
            ) : (
              'Not connected'
            )}
          </dd>
        </dl>
      </section>

      <section className="border-border rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Menu</h2>
          <span className="text-muted-foreground text-sm">
            {menus.length} menu{menus.length === 1 ? '' : 's'} · {categories.length} categor
            {categories.length === 1 ? 'y' : 'ies'} · {items.length} item
            {items.length === 1 ? '' : 's'}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="mt-4">
            <p className="text-muted-foreground text-sm">No menu items yet.</p>
            {canEditMenu ? (
              <Link
                href="/onboarding/menu"
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
              >
                Set up your menu
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {items.slice(0, 10).map((item) => {
              const category = categories.find((c) => String(c._id) === String(item.categoryId));
              return (
                <li
                  key={String(item._id)}
                  className="border-border flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <span>
                    <span className="text-foreground font-medium">{item.name}</span>
                    {category ? (
                      <span className="text-muted-foreground ml-2 text-xs">in {category.name}</span>
                    ) : null}
                  </span>
                  <span className="text-foreground font-mono">
                    {formatMoney(item.priceMinor, currency, locale)}
                  </span>
                </li>
              );
            })}
            {items.length > 10 ? (
              <li className="text-muted-foreground pt-2 text-xs">
                +{items.length - 10} more items
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="border-border rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Tables</h2>
          <span className="text-muted-foreground text-sm">
            {tables.length} table{tables.length === 1 ? '' : 's'}
          </span>
        </div>

        {tables.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            Takeaway / delivery only — no dine-in tables.
          </p>
        ) : (
          <div className="mt-4 flex items-start gap-6">
            <div className="flex-1">
              <ul className="space-y-1 text-sm">
                {tables.slice(0, 6).map((table) => (
                  <li key={String(table._id)} className="flex items-center justify-between">
                    <span className="text-foreground">
                      {table.name}{' '}
                      <span className="text-muted-foreground text-xs">(cap {table.capacity})</span>
                    </span>
                    <span className="text-muted-foreground text-xs capitalize">{table.status}</span>
                  </li>
                ))}
                {tables.length > 6 ? (
                  <li className="text-muted-foreground pt-2 text-xs">
                    +{tables.length - 6} more tables
                  </li>
                ) : null}
              </ul>
            </div>

            {firstTable && canPrintQr ? (
              <div className="border-border flex flex-col items-center rounded-md border bg-white p-3">
                <QRCodeSVG
                  value={`https://${slug}.menukaze.com/t/${firstTable.qrToken}`}
                  size={112}
                  level="M"
                />
                <p className="text-muted-foreground mt-2 text-center text-xs">{firstTable.name}</p>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="text-muted-foreground text-sm">
        <p>
          Phase 4 next steps: storefront (Step 9), cart + checkout (Step 10), order feed (Step 13),
          single-station KDS (Step 14), menu management (Step 15).
        </p>
      </section>
    </main>
  );
}
