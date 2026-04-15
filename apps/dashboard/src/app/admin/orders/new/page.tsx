import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import {
  currencyCodeOrDefault,
  filterActiveMenus,
  formatMoney,
  parseCurrencyCode,
} from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';
import { WalkInForm, type WalkInItem, type WalkInTable } from './walk-in-form';

export const dynamic = 'force-dynamic';

export default async function NewWalkInOrderPage() {
  const { restaurantId } = await requirePageFlag(['orders.create_walkin']);

  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item, Table } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) notFound();

  const [menus, categories, items, tables] = await Promise.all([
    Menu.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).lean().exec(),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
  ]);

  const activeMenus = filterActiveMenus(menus, restaurant.timezone);
  const activeMenuIds = new Set(activeMenus.map((m) => String(m._id)));
  const activeCategories = categories.filter((c) => activeMenuIds.has(String(c.menuId)));
  const activeCategoryIds = new Set(activeCategories.map((c) => String(c._id)));
  const activeItems = items.filter((i) => activeCategoryIds.has(String(i.categoryId)));

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const currencyLabel = currencyCodeOrDefault(restaurant.currency);

  const walkInItems: WalkInItem[] = activeItems.map((item) => ({
    id: String(item._id),
    categoryId: String(item.categoryId),
    name: item.name,
    priceMinor: item.priceMinor,
    priceLabel: formatMoney(item.priceMinor, currencyLabel, locale),
    soldOut: item.soldOut,
    modifiers: item.modifiers.map((group) => ({
      name: group.name,
      required: group.required,
      max: group.max,
      options: group.options.map((option) => ({
        name: option.name,
        priceMinor: option.priceMinor,
        priceLabel: formatMoney(option.priceMinor, currencyLabel, locale),
      })),
    })),
  }));

  const categoriesPayload = activeCategories.map((c) => ({ id: String(c._id), name: c.name }));

  const walkInTables: WalkInTable[] = tables.map((t) => ({
    id: String(t._id),
    name: t.name,
    capacity: t.capacity,
    status: t.status,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">New walk-in order</h1>
          <p className="text-muted-foreground text-sm">
            Build an order for a walk-in customer. Goes straight to the KDS once placed.
          </p>
        </div>
        <Link href="/admin/orders" className="text-foreground text-sm underline underline-offset-4">
          ← Back to orders
        </Link>
      </header>

      <WalkInForm
        items={walkInItems}
        categories={categoriesPayload}
        tables={walkInTables}
        currency={currency}
        locale={locale}
        taxRules={(restaurant.taxRules ?? []).map((r) => ({
          name: r.name,
          percent: r.percent,
          inclusive: r.inclusive,
          label: r.label,
          scope: r.scope,
        }))}
      />
    </main>
  );
}
