import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMongoConnection, getModels, loadMenuProjection } from '@menukaze/db';
import { currencyCodeOrDefault, formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { requirePageFlag } from '@/lib/session';
import { WalkInForm, type WalkInItem, type WalkInTable } from './walk-in-form';

export const dynamic = 'force-dynamic';

export default async function NewWalkInOrderPage() {
  const { restaurantId } = await requirePageFlag(['orders.create_walkin']);

  const conn = await getMongoConnection('live');
  const { Restaurant, Table } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) notFound();

  const [projection, tables] = await Promise.all([
    loadMenuProjection(conn, {
      restaurantId,
      timeZone: restaurant.timezone,
      channel: 'walk_in',
    }),
    Table.find({ restaurantId }).sort({ number: 1 }).lean().exec(),
  ]);

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const currencyLabel = currencyCodeOrDefault(restaurant.currency);

  const walkInItems: WalkInItem[] = projection.items.map((item) => ({
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    priceMinor: item.priceMinor,
    priceLabel: formatMoney(item.priceMinor, currencyLabel, locale),
    ...(item.taxClassId ? { taxClassId: item.taxClassId } : {}),
    soldOut: item.soldOut,
    variants: item.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      priceMinor: variant.priceMinor,
      priceLabel: formatMoney(variant.priceMinor, currencyLabel, locale),
      isDefault: variant.isDefault,
      soldOut: variant.soldOut,
    })),
    modifiers: item.modifiers.map((group) => ({
      name: group.name,
      required: group.min > 0,
      min: group.min,
      max: group.max,
      options: group.options.map((option) => ({
        name: option.name,
        priceMinor: option.priceMinor,
        priceLabel: formatMoney(option.priceMinor, currencyLabel, locale),
      })),
    })),
  }));

  const categoriesPayload = projection.categories.map((c) => ({ id: c.id, name: c.name }));

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
        taxClasses={restaurant.taxClasses ?? []}
      />
    </main>
  );
}
