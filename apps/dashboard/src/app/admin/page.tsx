import { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { signOutAction } from '@/app/actions/auth';

export default async function DashboardAdminPage() {
  const session = await requireOnboarded();

  // Load the restaurant for the header. Bypasses the tenant guard because we
  // pass an explicit _id filter — there's nothing tenant-scoped about
  // looking up the tenant root by primary key.
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(new Types.ObjectId(session.restaurantId)).exec();

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

      <section className="text-muted-foreground text-sm">
        <p>
          Phase 4 will add: menu management, order feed, KDS, table management, settings, staff.
        </p>
      </section>
    </main>
  );
}
