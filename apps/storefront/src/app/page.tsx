import type { Metadata } from 'next';
import { getMongoConnection, getModels } from '@menukaze/db';
import { filterActiveMenus, formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { computeOpenStatus, formatTodayHours } from '@/lib/hours';
import { StorefrontHeader } from './_components/storefront-header';
import { MenuBrowser } from './_components/menu-browser';
import { CartBoot } from './_components/cart-boot';
import { CartButton } from './_components/cart-button';
import { CookiePreferencesLink } from './_components/cookie-consent';

export const dynamic = 'force-dynamic';

/**
 * Dynamic metadata per tenant. Search crawlers hit the subdomain and need
 * restaurant-specific title / description / og image. Failing to resolve a
 * tenant here returns the default shell metadata from layout.tsx.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const restaurant = await resolveTenantOrNotFound();
    const title = restaurant.name;
    const description = restaurant.description ?? `Order from ${restaurant.name} on Menukaze.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        ...(restaurant.logoUrl ? { images: [{ url: restaurant.logoUrl }] } : {}),
        type: 'website',
      },
      twitter: { card: 'summary', title, description },
    };
  } catch {
    return { title: 'Menukaze', description: 'Restaurant storefront' };
  }
}

export default async function StorefrontHomePage() {
  const restaurant = await resolveTenantOrNotFound();

  // A restaurant can exist before it is live, but it should not accept orders.
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
  const activeMenus = filterActiveMenus(menus, restaurant.timezone);
  const activeMenuIds = new Set(activeMenus.map((menu) => String(menu._id)));
  const activeCategories = categories.filter((category) =>
    activeMenuIds.has(String(category.menuId)),
  );
  const activeCategoryIds = new Set(activeCategories.map((category) => String(category._id)));
  const activeItems = items.filter((item) => activeCategoryIds.has(String(item.categoryId)));
  const itemNameById = new Map(items.map((item) => [String(item._id), item.name]));

  const currency = parseCurrencyCode(restaurant.currency);
  const locale = restaurant.locale;
  const openStatus = computeOpenStatus(restaurant);
  const todayHours = formatTodayHours(restaurant);

  // Schema.org Restaurant JSON-LD helps search engines render rich results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    description: restaurant.description,
    image: restaurant.logoUrl,
    telephone: restaurant.phone,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: [restaurant.addressStructured.line1, restaurant.addressStructured.line2]
        .filter(Boolean)
        .join(', '),
      addressLocality: restaurant.addressStructured.city,
      addressRegion: restaurant.addressStructured.state,
      postalCode: restaurant.addressStructured.postalCode,
      addressCountry: restaurant.addressStructured.country,
    },
    servesCuisine: activeItems.map((i) => i.name).slice(0, 5),
    menu: `https://${restaurant.slug}.menukaze.com/`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StorefrontHeader
        name={restaurant.name}
        description={restaurant.description}
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
        {activeItems.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No menu is active right now. Check back during service hours.
          </p>
        ) : (
          <MenuBrowser
            menus={activeMenus.map((m) => ({ id: String(m._id), name: m.name }))}
            categories={activeCategories.map((c) => ({
              id: String(c._id),
              name: c.name,
              menuId: String(c.menuId),
            }))}
            items={activeItems.map((i) => ({
              id: String(i._id),
              categoryId: String(i.categoryId),
              name: i.name,
              description: i.description,
              priceLabel: formatMoney(i.priceMinor, currency, locale),
              priceMinor: i.priceMinor,
              dietaryTags: i.dietaryTags,
              soldOut: i.soldOut,
              imageUrl: i.imageUrl,
              comboItemNames:
                i.comboOf?.map((comboId) => itemNameById.get(String(comboId)) ?? 'Unknown item') ??
                [],
              modifiers: i.modifiers.map((group) => ({
                name: group.name,
                required: group.required,
                max: group.max,
                options: group.options.map((option) => ({
                  name: option.name,
                  priceMinor: option.priceMinor,
                  priceLabel: formatMoney(option.priceMinor, currency, locale),
                })),
              })),
            }))}
            currency={currency}
            locale={locale}
          />
        )}
      </main>

      <footer className="border-border text-muted-foreground border-t py-8 text-center text-xs">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {restaurant.reservationSettings?.enabled ? (
            <a
              href="/reservations"
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              Reservations
            </a>
          ) : null}
          <a href="/privacy" className="hover:text-foreground underline-offset-2 hover:underline">
            Privacy
          </a>
          <a href="/terms" className="hover:text-foreground underline-offset-2 hover:underline">
            Terms
          </a>
          <CookiePreferencesLink />
          <span>Powered by Menukaze</span>
        </div>
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
