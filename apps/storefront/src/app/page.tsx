import type { Metadata } from 'next';
import { getMongoConnection, getModels } from '@menukaze/db';
import { filterActiveMenus, formatMoney, parseCurrencyCode } from '@menukaze/shared';
import { BrandRow, Eyebrow, MeshBackdrop } from '@menukaze/ui';
import { resolveTenantOrNotFound } from '@/lib/tenant';
import { computeOpenStatus, formatTodayHours } from '@/lib/hours';
import { StorefrontHeader } from './_components/storefront-header';
import { MenuBrowser } from './_components/menu-browser';
import { CartBoot } from './_components/cart-boot';
import { CartButton } from './_components/cart-button';
import { CookiePreferencesLink } from './_components/cookie-consent';

export const dynamic = 'force-dynamic';

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

      <main className="mx-auto max-w-5xl px-4 pb-40 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        {activeItems.length === 0 ? (
          <div className="border-ink-200 bg-canvas-50 dark:border-ink-800 dark:bg-ink-900/40 rounded-2xl border border-dashed px-6 py-20 text-center">
            <p className="text-ink-600 dark:text-ink-300 font-serif text-xl">
              No menu is active right now.
            </p>
            <p className="text-ink-500 dark:text-ink-400 mt-1 text-sm">
              Check back during service hours.
            </p>
          </div>
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

      <footer className="border-ink-100 bg-canvas-100 dark:border-ink-900 dark:bg-ink-950/70 relative border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-10 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <BrandRow size="sm" />
            <span className="text-ink-400 dark:text-ink-500 text-[11px] uppercase tracking-[0.18em]">
              Craft for restaurants
            </span>
          </div>
          <div className="text-ink-500 dark:text-ink-400 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            {restaurant.reservationSettings?.enabled ? (
              <a
                href="/reservations"
                className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
              >
                Reservations
              </a>
            ) : null}
            <a
              href="/privacy"
              className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
            >
              Terms
            </a>
            <CookiePreferencesLink />
          </div>
        </div>
      </footer>

      <CartBoot restaurantId={String(restaurantId)} currency={currency} locale={locale} />
      <CartButton />
    </>
  );
}

function ComingSoonView({ name }: { name: string }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      <MeshBackdrop />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <Eyebrow withBar tone="accent">
          Coming soon
        </Eyebrow>
        <h1 className="text-foreground font-serif text-5xl font-medium tracking-tight sm:text-6xl md:text-7xl">
          {name}
        </h1>
        <p className="text-ink-500 dark:text-ink-400 max-w-sm text-base">
          This restaurant is just putting the finishing touches on its Menukaze storefront. Check
          back soon.
        </p>
        <div className="mt-4">
          <BrandRow size="sm" />
        </div>
      </div>
    </main>
  );
}
