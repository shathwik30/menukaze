import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { getMongoConnection, getModels } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney } from '@menukaze/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Eyebrow,
  StatCard,
  cn,
} from '@menukaze/ui';
import { requireOnboardedRestaurant } from '@/lib/session';
import { computeChecklist } from '@/lib/onboarding-checklist';
import { OnboardingChecklistCard } from './onboarding-checklist-card';

export const dynamic = 'force-dynamic';

export default async function DashboardAdminPage() {
  const { session, restaurantId } = await requireOnboardedRestaurant();

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item, Table, Order } = getModels(conn);
  const [restaurant, menus, categories, items, tables, orderAgg] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Menu.find({ restaurantId }).sort({ order: 1 }).exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).exec(),
    Order.aggregate<{
      todayCount: number;
      todayRevenueMinor: number;
      activeCount: number;
    }>([
      { $match: { restaurantId } },
      {
        $facet: {
          today: [
            {
              $match: {
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                status: { $nin: ['cancelled'] },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                revenueMinor: { $sum: '$totalMinor' },
              },
            },
          ],
          active: [
            {
              $match: {
                status: {
                  $in: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'],
                },
              },
            },
            { $count: 'count' },
          ],
        },
      },
      {
        $project: {
          todayCount: { $ifNull: [{ $arrayElemAt: ['$today.count', 0] }, 0] },
          todayRevenueMinor: { $ifNull: [{ $arrayElemAt: ['$today.revenueMinor', 0] }, 0] },
          activeCount: { $ifNull: [{ $arrayElemAt: ['$active.count', 0] }, 0] },
        },
      },
    ]).catch(() => []),
  ]);

  const currency = currencyCodeOrDefault(restaurant?.currency);
  const locale = restaurant?.locale ?? 'en-US';
  const slug = restaurant?.slug ?? 'demo';
  const firstTable = tables[0];
  const has = (flag: (typeof session.permissions)[number]) => session.permissions.includes(flag);
  const canEditMenu = has('menu.edit');
  const canPrintQr = has('tables.qr_print');
  const canViewSettings = session.permissions.some((flag) => flag.startsWith('settings.'));
  const stats = orderAgg[0] ?? { todayCount: 0, todayRevenueMinor: 0, activeCount: 0 };

  const showChecklist = restaurant && !restaurant.checklistDismissed && canViewSettings;
  const checklist = restaurant ? computeChecklist(restaurant, items, tables) : null;

  const firstName = session.user.name?.split(' ')[0] ?? 'there';
  const greeting = greetingFor(new Date());

  return (
    <div className="min-h-screen">
      <div className="border-ink-100 bg-surface dark:border-ink-900 dark:bg-ink-900 relative overflow-hidden border-b">
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 15% 0%, oklch(0.885 0.100 68 / 0.25), transparent 60%), radial-gradient(ellipse 40% 30% at 85% 0%, oklch(0.850 0.085 162 / 0.18), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 pt-10 pb-10 sm:px-8 lg:px-10">
          <Eyebrow tone="accent">{greeting}</Eyebrow>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-foreground font-serif text-4xl leading-none font-medium tracking-tight sm:text-5xl">
                Welcome back, {firstName}.
              </h1>
              <p className="text-ink-500 dark:text-ink-400 mt-2 text-sm">
                Here&apos;s what&apos;s happening at {restaurant?.name} today.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {has('orders.view_all') ? (
                <Link href="/admin/orders">
                  <Button variant="primary" size="md">
                    <span className="bg-jade-400 inline-flex size-2 animate-pulse rounded-full" />
                    Live orders
                  </Button>
                </Link>
              ) : null}
              {has('orders.create_walkin') ? (
                <Link href="/admin/orders/new">
                  <Button variant="outline" size="md">
                    New walk-in
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
        <section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Revenue today"
              value={formatMoney(stats.todayRevenueMinor, currency, locale)}
              caption="vs yesterday"
              icon={<CashIcon />}
            />
            <StatCard
              label="Orders today"
              value={stats.todayCount}
              caption={stats.todayCount === 1 ? 'order' : 'orders'}
              icon={<ReceiptIcon />}
            />
            <StatCard
              label="Active now"
              value={stats.activeCount}
              caption="in progress"
              icon={<BellIcon />}
            />
            <StatCard
              label="Menu items"
              value={items.length}
              caption={`${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
              icon={<MenuIcon />}
            />
          </div>
        </section>

        {showChecklist && checklist ? <OnboardingChecklistCard checklist={checklist} /> : null}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card variant="surface" radius="lg" className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Menu</CardTitle>
                  <CardDescription>
                    {menus.length} menu{menus.length === 1 ? '' : 's'} · {categories.length} categor
                    {categories.length === 1 ? 'y' : 'ies'} · {items.length} item
                    {items.length === 1 ? '' : 's'}
                  </CardDescription>
                </div>
                {canEditMenu ? (
                  <Link href="/admin/menu">
                    <Button variant="outline" size="sm">
                      Manage
                      <ArrowIcon />
                    </Button>
                  </Link>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="border-ink-200 dark:border-ink-800 rounded-xl border border-dashed px-4 py-8 text-center">
                  <p className="text-ink-500 dark:text-ink-400 text-sm">
                    You haven&apos;t added any menu items yet.
                  </p>
                  {canEditMenu ? (
                    <Link href="/onboarding/menu" className="mt-3 inline-flex">
                      <Button variant="primary" size="sm">
                        Set up your menu
                      </Button>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-ink-100 dark:divide-ink-800 divide-y">
                  {items.slice(0, 6).map((item) => {
                    const category = categories.find(
                      (c) => String(c._id) === String(item.categoryId),
                    );
                    return (
                      <li
                        key={String(item._id)}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-sm font-medium">
                            {item.name}
                          </p>
                          {category ? (
                            <p className="text-ink-500 dark:text-ink-400 truncate text-[11px]">
                              {category.name}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.soldOut ? (
                            <Badge variant="danger" size="xs" shape="pill">
                              Sold out
                            </Badge>
                          ) : null}
                          <span className="mk-nums text-foreground font-mono text-[13px] tabular-nums">
                            {formatMoney(item.priceMinor, currency, locale)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {items.length > 6 ? (
                    <li className="pt-3 text-center">
                      <Link
                        href="/admin/menu"
                        className="text-saffron-700 dark:text-saffron-400 text-xs font-medium underline underline-offset-4"
                      >
                        View all {items.length} items →
                      </Link>
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card variant="surface" radius="lg">
            <CardHeader>
              <CardTitle>Restaurant profile</CardTitle>
              <CardDescription>Public identity & billing</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-ink-100 dark:divide-ink-800 divide-y text-sm">
                <ProfileRow label="Slug">
                  <span className="font-mono text-xs">{restaurant?.slug}</span>
                </ProfileRow>
                <ProfileRow label="Country">{restaurant?.country}</ProfileRow>
                <ProfileRow label="Currency">
                  <span className="font-mono text-xs">{restaurant?.currency}</span>
                </ProfileRow>
                <ProfileRow label="Timezone">
                  <span className="font-mono text-xs">{restaurant?.timezone}</span>
                </ProfileRow>
                <ProfileRow label="Subscription">
                  <Badge
                    variant={restaurant?.subscriptionStatus === 'active' ? 'success' : 'subtle'}
                    size="xs"
                    shape="pill"
                  >
                    {restaurant?.subscriptionStatus ?? 'trial'}
                  </Badge>
                </ProfileRow>
                <ProfileRow label="Razorpay">
                  {restaurant?.razorpayKeyIdEnc ? (
                    <Badge variant="success" size="xs" shape="pill" dot>
                      Connected
                    </Badge>
                  ) : has('payments.configure') ? (
                    <Link
                      href="/onboarding/razorpay"
                      className="text-saffron-700 dark:text-saffron-400 text-xs font-medium underline underline-offset-4"
                    >
                      Not connected
                    </Link>
                  ) : (
                    <span className="text-ink-500 text-xs">Not connected</span>
                  )}
                </ProfileRow>
              </dl>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card variant="surface" radius="lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tables &amp; QR</CardTitle>
                  <CardDescription>
                    {tables.length} table{tables.length === 1 ? '' : 's'} ·{' '}
                    {tables.filter((t) => t.status === 'available').length} available
                  </CardDescription>
                </div>
                {has('tables.view') ? (
                  <Link href="/admin/tables">
                    <Button variant="outline" size="sm">
                      Manage
                      <ArrowIcon />
                    </Button>
                  </Link>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {tables.length === 0 ? (
                <p className="text-ink-500 dark:text-ink-400 text-sm">
                  Takeaway / delivery only — no dine-in tables configured.
                </p>
              ) : (
                <div className="grid gap-6 md:grid-cols-[1fr_auto]">
                  <div>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {tables.slice(0, 9).map((table) => (
                        <li
                          key={String(table._id)}
                          className="border-ink-100 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/70 flex items-center justify-between rounded-lg border px-3 py-2"
                        >
                          <div>
                            <p className="text-foreground text-sm font-medium">{table.name}</p>
                            <p className="text-ink-500 dark:text-ink-400 text-[11px]">
                              Cap {table.capacity}
                            </p>
                          </div>
                          <span
                            aria-hidden
                            className={cn(
                              'size-2 rounded-full',
                              table.status === 'available' && 'bg-jade-500',
                              table.status === 'occupied' && 'bg-saffron-500',
                              table.status === 'bill_requested' && 'bg-lapis-500',
                              table.status === 'needs_review' && 'bg-mkrose-500',
                              table.status === 'paid' && 'bg-ink-400',
                            )}
                          />
                        </li>
                      ))}
                    </ul>
                    {tables.length > 9 ? (
                      <p className="text-ink-500 dark:text-ink-400 mt-3 text-xs">
                        +{tables.length - 9} more tables
                      </p>
                    ) : null}
                  </div>
                  {firstTable && canPrintQr ? (
                    <div className="border-ink-200 dark:border-ink-700 dark:bg-canvas-50 flex flex-col items-center rounded-xl border bg-white p-4">
                      <QRCodeSVG
                        value={`https://${slug}.menukaze.com/t/${firstTable.qrToken}`}
                        size={128}
                        level="M"
                        fgColor="#1a1511"
                      />
                      <p className="text-ink-600 dark:text-ink-900 mt-2 font-mono text-[11px] tracking-wide">
                        {firstTable.name}
                      </p>
                      <Link
                        href="/admin/tables/print"
                        className="text-ink-600 dark:text-ink-900 mt-3 text-[11px] font-medium underline underline-offset-4"
                      >
                        Print all QRs
                      </Link>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-ink-500 dark:text-ink-400 text-[11px] font-medium tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className="text-foreground truncate text-sm">{children}</dd>
    </div>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return 'Still open';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Late service';
}

function CashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 2v20l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V2l-2 2-2-2-2 2-2-2-2 2-2-2-2 2Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
