import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getMongoConnection, getModels } from '@menukaze/db';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { computeOpenStatus, formatTodayHours } from '@/lib/hours';
import { StorefrontHeader } from './_components/storefront-header';
import { MenuBrowser } from './_components/menu-browser';
import { CartBoot } from './_components/cart-boot';
import { CartButton } from './_components/cart-button';

export const dynamic = 'force-dynamic';

export default async function StorefrontHomePage() {
  // Short-circuit apex / reserved hosts so /admin.menukaze.com etc. doesn't
  // try to resolve a tenant (the middleware already marked them).
  const h = await headers();
  const kind = h.get('x-tenant-kind');
  if (kind !== 'subdomain' && kind !== 'custom') notFound();

  const restaurant = await resolveTenantOrNotFound();

  // A restaurant that hasn't clicked Go Live yet gets a "Coming Soon" page —
  // still a valid tenant, just not open for orders.
  if (!restaurant.liveAt) {
    return <ComingSoonView name={restaurant.name} />;
  }

  const conn = await getMongoConnection('live');
  const { Menu, Category, Item } = getModels(conn);
  const restaurantId = restaurant._id;

  const [menus, categories, items] = await Promise.all([
    Menu.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).lean().exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).lean().exec(),
  ]);

  const currency = restaurant.currency as CurrencyCode;
  const locale = restaurant.locale;
  const openStatus = computeOpenStatus(restaurant);
  const todayHours = formatTodayHours(restaurant);

  return (
    <>
      <StorefrontHeader
        name={restaurant.name}
        logoUrl={restaurant.logoUrl}
        address={restaurant.addressStructured}
        isOpen={openStatus.open}
        statusLabel={
          openStatus.open
            ? `Open now · closes ${openStatus.closesAt}`
            : (openStatus.nextOpenLabel ?? 'Closed')
        }
        todayHours={todayHours}
        phone={restaurant.phone}
      />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Menu coming soon — the restaurant hasn&apos;t published any items yet.
          </p>
        ) : (
          <MenuBrowser
            menus={menus.map((m) => ({ id: String(m._id), name: m.name }))}
            categories={categories.map((c) => ({
              id: String(c._id),
              name: c.name,
              menuId: String(c.menuId),
            }))}
            items={items.map((i) => ({
              id: String(i._id),
              categoryId: String(i.categoryId),
              name: i.name,
              description: i.description,
              priceLabel: formatMoney(i.priceMinor, currency, locale),
              priceMinor: i.priceMinor,
              dietaryTags: i.dietaryTags,
              soldOut: i.soldOut,
            }))}
          />
        )}
      </main>

      <footer className="border-border text-muted-foreground border-t py-8 text-center text-xs">
        Powered by Menukaze
      </footer>

      <CartBoot restaurantId={String(restaurantId)} currency={currency} locale={locale} />
      <CartButton />
    </>
  );
}

function ComingSoonView({ name }: { name: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-bold">{name}</h1>
      <p className="text-muted-foreground">
        Coming soon — this restaurant is still setting up its Menukaze storefront.
      </p>
    </main>
  );
}
