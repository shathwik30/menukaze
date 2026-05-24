import { notFound, redirect } from 'next/navigation';
import { getMongoConnection, getModels, loadMenuProjection } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import {
  formatMoney,
  normalizeDineInSessionTimeoutMinutes,
  parseCurrencyCode,
} from '@menukaze/shared';
import { Avatar, Badge, Eyebrow } from '@menukaze/ui';
import { SessionClient, type SessionItem, type SessionRound } from './session-client';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const sessionObjectId = parseObjectId(sessionId);
  if (!sessionObjectId) notFound();

  const conn = await getMongoConnection('live');
  const { TableSession, Restaurant, Order, Table } = getModels(conn);

  const session = await TableSession.findOne({ _id: sessionObjectId }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) notFound();

  if (session.status === 'closed' || session.status === 'paid') {
    redirect('/');
  }

  const restaurantId = session.restaurantId;
  const [restaurant, table, orders] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.findOne({ restaurantId, _id: session.tableId }).exec(),
    Order.find({ restaurantId, sessionId: session._id }).sort({ createdAt: 1 }).lean().exec(),
  ]);
  if (!restaurant || !table) notFound();
  const projection = await loadMenuProjection(conn, {
    restaurantId,
    timeZone: restaurant.timezone,
    channel: 'qr_dinein',
  });

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;

  const sessionItems: SessionItem[] = projection.items.map((i) => {
    const category = projection.categories.find((c) => c.id === i.categoryId);
    return {
      id: i.id,
      name: i.name,
      description: i.description,
      priceMinor: i.priceMinor,
      priceLabel: formatMoney(i.priceMinor, currency, locale),
      categoryId: i.categoryId,
      categoryName: category?.name ?? 'Menu',
      allergens: i.allergens,
      featured: i.featured,
      searchKeywords: i.searchKeywords,
      taxClassId: i.taxClassId,
      variants: i.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        priceMinor: variant.priceMinor,
        priceLabel: formatMoney(variant.priceMinor, currency, locale),
        isDefault: variant.isDefault,
        soldOut: variant.soldOut,
      })),
      soldOut: i.soldOut,
      imageUrl: i.imageUrl,
      comboItemNames: [],
      modifiers: i.modifiers.map((group) => ({
        name: group.name,
        required: group.min > 0,
        min: group.min,
        max: group.max,
        options: group.options.map((option) => ({
          name: option.name,
          priceMinor: option.priceMinor,
          priceLabel: formatMoney(option.priceMinor, currency, locale),
        })),
      })),
    };
  });

  const menuTabs = projection.menus.map((m) => ({ id: m.id, name: m.name }));
  const categoryList = projection.categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    menuId: c.menuId,
    menuIds: c.menuIds,
  }));

  const rounds: SessionRound[] = orders.map((o) => ({
    id: String(o._id),
    publicOrderId: o.publicOrderId,
    status: o.status,
    totalLabel: formatMoney(o.totalMinor, currency, locale),
    items: o.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
    })),
  }));

  const totalMinor = orders.reduce((s, o) => s + o.totalMinor, 0);

  return (
    <div className="bg-canvas-100 dark:bg-ink-950 min-h-screen">
      <header className="border-ink-100 bg-surface/80 dark:border-ink-900 dark:bg-ink-900/70 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <Eyebrow tone="accent">Dine-in</Eyebrow>
            <p className="text-foreground truncate font-serif text-lg leading-tight font-medium tracking-tight">
              {restaurant.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="subtle" size="md" shape="pill">
              {table.name}
            </Badge>
            <Avatar fallback={session.customer.name} size="sm" />
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6">
        <SessionClient
          restaurantId={String(restaurantId)}
          sessionId={String(session._id)}
          status={session.status}
          customerName={session.customer.name}
          participants={session.participants.map((participant) => participant.label)}
          menus={menuTabs}
          categories={categoryList}
          items={sessionItems}
          rounds={rounds}
          totalLabel={formatMoney(totalMinor, currency, locale)}
          currency={currency}
          locale={locale}
          lastActivityAt={session.lastActivityAt.toISOString()}
          sessionTimeoutMinutes={normalizeDineInSessionTimeoutMinutes(
            restaurant.dineInSessionTimeoutMinutes,
          )}
          paymentModeRequested={session.paymentModeRequested}
        />
      </main>
    </div>
  );
}
