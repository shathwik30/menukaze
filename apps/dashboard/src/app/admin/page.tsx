import { Types } from 'mongoose';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { formatMoney, type CurrencyCode } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';
import { signOutAction } from '@/app/actions/auth';

export default async function DashboardAdminPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  // Load the restaurant for the header. Bypasses the tenant guard because we
  // pass an explicit _id filter — there's nothing tenant-scoped about
  // looking up the tenant root by primary key.
  const conn = await getMongoConnection('live');
  const { Restaurant, Menu, Category, Item } = getModels(conn);
  const [restaurant, menus, categories, items] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Menu.find({ restaurantId }).sort({ order: 1 }).exec(),
    Category.find({ restaurantId }).sort({ order: 1 }).exec(),
    Item.find({ restaurantId }).sort({ createdAt: 1 }).exec(),
  ]);

  const currency = (restaurant?.currency ?? 'USD') as CurrencyCode;
  const locale = restaurant?.locale ?? 'en-US';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{restaurant?.name ?? 'Menukaze'}</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as <span className="text-foreground font-medium">{session.user.email}</span>
          </p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="border-border rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Restaurant profile</h2>
        <dl className="text-muted-foreground mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt>Slug</dt>
          <dd className="text-foreground font-mono">{restaurant?.slug}</dd>
          <dt>Country</dt>
          <dd className="text-foreground">{restaurant?.country}</dd>
          <dt>Currency</dt>
          <dd className="text-foreground">{restaurant?.currency}</dd>
          <dt>Locale</dt>
          <dd className="text-foreground">{restaurant?.locale}</dd>
          <dt>Timezone</dt>
          <dd className="text-foreground">{restaurant?.timezone}</dd>
          <dt>Subscription</dt>
          <dd className="text-foreground">{restaurant?.subscriptionStatus}</dd>
        </dl>
      </section>

      <section className="border-border rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Menu</h2>
          <span className="text-muted-foreground text-sm">
            {menus.length} menu{menus.length === 1 ? '' : 's'} · {categories.length} categor
            {categories.length === 1 ? 'y' : 'ies'} · {items.length} item
            {items.length === 1 ? '' : 's'}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="mt-4">
            <p className="text-muted-foreground text-sm">No menu items yet.</p>
            <Link
              href="/onboarding/menu"
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
            >
              Set up your menu
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {items.slice(0, 10).map((item) => {
              const category = categories.find((c) => String(c._id) === String(item.categoryId));
              return (
                <li
                  key={String(item._id)}
                  className="border-border flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <span>
                    <span className="text-foreground font-medium">{item.name}</span>
                    {category ? (
                      <span className="text-muted-foreground ml-2 text-xs">in {category.name}</span>
                    ) : null}
                  </span>
                  <span className="text-foreground font-mono">
                    {formatMoney(item.priceMinor, currency, locale)}
                  </span>
                </li>
              );
            })}
            {items.length > 10 ? (
              <li className="text-muted-foreground pt-2 text-xs">
                +{items.length - 10} more items
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="text-muted-foreground text-sm">
        <p>
          Phase 4 next steps: tables (Step 5), Razorpay (Step 6), order feed (Step 13),
          single-station KDS (Step 14), menu management (Step 15).
        </p>
      </section>
    </main>
  );
}
