import { Types } from 'mongoose';
import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { GoLiveButton } from './go-live-button';

/**
 * Step 8 of the onboarding wizard — Go Live summary + activation.
 *
 * Shows a read-only summary of everything the user configured in steps 1-6
 * (profile, menu, tables, Razorpay), a "Preview storefront" link, and a
 * "Go Live" action button. Activation advances onboardingStep → 'complete'.
 */
export default async function OnboardingGoLivePage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Item, Table } = getModels(conn);
  const [restaurant, itemCount, tableCount] = await Promise.all([
    Restaurant.findById(restaurantId).exec(),
    Item.countDocuments({ restaurantId }).exec(),
    Table.countDocuments({ restaurantId }).exec(),
  ]);
  if (!restaurant) redirect('/onboarding');
  if (restaurant.onboardingStep !== 'go-live') redirect('/admin');

  // In local dev the storefront runs on :3001 at {slug}.localhost.menukaze.dev.
  // In production it's {slug}.menukaze.com. We render both so the user can
  // pick whichever their environment supports.
  const prodStorefront = `https://${restaurant.slug}.menukaze.com`;
  const devStorefront = `http://${restaurant.slug}.localhost.menukaze.dev:3001`;
  const hasRazorpay = Boolean(restaurant.razorpayKeyIdEnc);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 6 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">You&apos;re ready to go live</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Here&apos;s everything you&apos;ve set up. Preview your storefront, or go live to start
          accepting orders.
        </p>
      </header>

      <section className="border-border rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Summary</h2>
        <dl className="text-muted-foreground mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt>Restaurant</dt>
          <dd className="text-foreground">{restaurant.name}</dd>
          <dt>Subdomain</dt>
          <dd className="text-foreground font-mono">{restaurant.slug}.menukaze.com</dd>
          <dt>Country</dt>
          <dd className="text-foreground">{restaurant.country}</dd>
          <dt>Currency</dt>
          <dd className="text-foreground">{restaurant.currency}</dd>
          <dt>Menu items</dt>
          <dd className="text-foreground">{itemCount}</dd>
          <dt>Tables</dt>
          <dd className="text-foreground">
            {tableCount === 0 ? 'Takeaway / delivery only' : tableCount}
          </dd>
          <dt>Razorpay</dt>
          <dd className="text-foreground">
            {hasRazorpay ? 'Connected (test mode)' : 'Not connected'}
          </dd>
        </dl>
      </section>

      <section className="border-border rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Preview your storefront</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Open your public restaurant page in a new tab. Share the link with anyone &mdash; or use
          your own phone to scan a table QR.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={devStorefront}
            target="_blank"
            rel="noreferrer"
            className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Preview (dev)
          </a>
          <a
            href={prodStorefront}
            target="_blank"
            rel="noreferrer"
            className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Preview (production)
          </a>
        </div>
      </section>

      <GoLiveButton canActivate={itemCount > 0} hasRazorpay={hasRazorpay} itemCount={itemCount} />

      <footer className="text-muted-foreground text-xs">
        Operating <span className="text-foreground font-mono">{restaurant.slug}</span>
      </footer>
    </main>
  );
}
