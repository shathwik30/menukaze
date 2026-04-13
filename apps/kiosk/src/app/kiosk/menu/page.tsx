import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { filterActiveMenus, formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { MenuClient, type KioskCategory, type KioskItem, type KioskMenu } from './menu-client';

export const dynamic = 'force-dynamic';

export default async function KioskMenuPage() {
  const restaurant = await resolveTenantOrNotFound();
  if (!restaurant.liveAt) redirect('/kiosk');

  const conn = await getMongoConnection('live');
  const { Menu, Category, Item } = getModels(conn);

  const [menus, categories, items] = await Promise.all([
    Menu.find({ restaurantId: restaurant._id }).sort({ order: 1 }).lean().exec(),
    Category.find({ restaurantId: restaurant._id }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId: restaurant._id }).sort({ createdAt: 1 }).lean().exec(),
  ]);

  const activeMenus = filterActiveMenus(menus, restaurant.timezone);
  const activeMenuIds = new Set(activeMenus.map((m) => String(m._id)));
  const activeCategories = categories.filter((c) => activeMenuIds.has(String(c.menuId)));
  const activeCategoryIds = new Set(activeCategories.map((c) => String(c._id)));
  const activeItems = items.filter((i) => activeCategoryIds.has(String(i.categoryId)));

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const itemNameById = new Map(items.map((i) => [String(i._id), i.name]));

  const kioskMenus: KioskMenu[] = activeMenus.map((m) => ({
    id: String(m._id),
    name: m.name,
  }));

  const kioskCategories: KioskCategory[] = activeCategories.map((c) => ({
    id: String(c._id),
    name: c.name,
    menuId: String(c.menuId),
  }));

  const kioskItems: KioskItem[] = activeItems.map((i) => ({
    id: String(i._id),
    categoryId: String(i.categoryId),
    name: i.name,
    description: i.description,
    priceMinor: i.priceMinor,
    priceLabel: formatMoney(i.priceMinor, currency, locale),
    imageUrl: i.imageUrl,
    soldOut: i.soldOut,
    comboItemNames: i.comboOf?.map((id) => itemNameById.get(String(id)) ?? 'Unknown item') ?? [],
    modifiers: i.modifiers.map((g) => ({
      name: g.name,
      required: g.required,
      max: g.max,
      options: g.options.map((o) => ({
        name: o.name,
        priceMinor: o.priceMinor,
        priceLabel: formatMoney(o.priceMinor, currency, locale),
      })),
    })),
  }));

  return (
    <MenuClient
      restaurantId={String(restaurant._id)}
      restaurantName={restaurant.name}
      currency={restaurant.currency}
      locale={locale}
      menus={kioskMenus}
      categories={kioskCategories}
      items={kioskItems}
      taxRules={restaurant.taxRules ?? []}
      minimumOrderMinor={restaurant.minimumOrderMinor ?? 0}
    />
  );
}
