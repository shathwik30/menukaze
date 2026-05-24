import { redirect } from 'next/navigation';
import { getMongoConnection, loadMenuProjection } from '@menukaze/db';
import { formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { serializeTaxRules } from '@/lib/tax-rules';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { MenuClient, type KioskCategory, type KioskItem, type KioskMenu } from './menu-client';

export const dynamic = 'force-dynamic';

export default async function KioskMenuPage() {
  const restaurant = await resolveTenantOrNotFound();
  if (!restaurant.liveAt) redirect('/kiosk');

  const conn = await getMongoConnection('live');
  const projection = await loadMenuProjection(conn, {
    restaurantId: restaurant._id,
    timeZone: restaurant.timezone,
    channel: 'kiosk',
  });

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const taxRules = serializeTaxRules(restaurant.taxRules);

  const kioskMenus: KioskMenu[] = projection.menus.map((m) => ({
    id: m.id,
    name: m.name,
  }));

  const kioskCategories: KioskCategory[] = projection.categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    menuId: c.menuId,
    menuIds: c.menuIds,
  }));

  const kioskItems: KioskItem[] = projection.items.map((i) => ({
    id: i.id,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    priceMinor: i.priceMinor,
    priceLabel: formatMoney(i.priceMinor, currency, locale),
    imageUrl: i.imageUrl,
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
    comboItemNames: [],
    modifiers: i.modifiers.map((g) => ({
      name: g.name,
      required: g.min > 0,
      min: g.min,
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
      taxRules={taxRules}
      taxClasses={restaurant.taxClasses ?? []}
      minimumOrderMinor={restaurant.minimumOrderMinor ?? 0}
    />
  );
}
