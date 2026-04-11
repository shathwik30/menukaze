import { Types } from 'mongoose';
import { notFound, redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { SessionClient, type SessionItem, type SessionRound } from './session-client';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!Types.ObjectId.isValid(sessionId)) notFound();

  const conn = await getMongoConnection('live');
  const { TableSession, Restaurant, Menu, Category, Item, Order, Table } = getModels(conn);

  const session = await TableSession.findOne({ _id: new Types.ObjectId(sessionId) }, null, {
    skipTenantGuard: true,
  }).exec();
  if (!session) notFound();

  if (session.status === 'closed' || session.status === 'paid') {
    redirect('/');
  }

  const restaurantId = session.restaurantId;
  const [restaurant, table, menus, categories, items, orders] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Table.findOne({ restaurantId, _id: session.tableId }).exec(),
    Menu.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).lean().exec(),
    Order.find({ restaurantId, sessionId: session._id }).sort({ createdAt: 1 }).lean().exec(),
  ]);
  if (!restaurant || !table) notFound();

  const currency = restaurant.currency as CurrencyCode;
  const locale = restaurant.locale;

  const sessionItems: SessionItem[] = items.map((i) => {
    const category = categories.find((c) => String(c._id) === String(i.categoryId));
    return {
      id: String(i._id),
      name: i.name,
      description: i.description,
      priceMinor: i.priceMinor,
      priceLabel: formatMoney(i.priceMinor, currency, locale),
      categoryId: String(i.categoryId),
      categoryName: category?.name ?? 'Menu',
      soldOut: i.soldOut,
    };
  });

  const menuTabs = menus.map((m) => ({ id: String(m._id), name: m.name }));
  const categoryList = categories.map((c) => ({
    id: String(c._id),
    name: c.name,
    menuId: String(c.menuId),
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">{restaurant.name}</h1>
        <p className="text-muted-foreground text-sm">
          {table.name} · {session.customer.name}
        </p>
      </header>

      <SessionClient
        sessionId={String(session._id)}
        status={session.status}
        menus={menuTabs}
        categories={categoryList}
        items={sessionItems}
        rounds={rounds}
        totalLabel={formatMoney(totalMinor, currency, locale)}
        currency={currency}
        locale={locale}
      />
    </main>
  );
}
