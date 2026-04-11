import { Types } from 'mongoose';
import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { MenuSetupForm } from './menu-setup-form';

/**
 * Step 4 of the onboarding wizard — Menu Setup (manual entry only).
 *
 * Guards:
 *   - Must be signed in AND have completed onboarding step 3 (restaurant
 *     exists). `requireOnboarded` handles both — bouncing to /login or
 *     /onboarding if either condition fails.
 *   - Must NOT already have items → bounce to /admin if they do.
 */
export default async function OnboardingMenuPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { Restaurant, Item } = getModels(conn);

  // Re-onboarding guard
  const itemCount = await Item.countDocuments({ restaurantId }).exec();
  if (itemCount > 0) redirect('/admin');

  const restaurant = await Restaurant.findById(restaurantId).exec();
  const currency = restaurant?.currency ?? 'USD';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 2 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">Add your first menu items</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Create one category and the items inside it. You can add more categories, modifiers,
          variants, and images later from the Menu Management dashboard.
        </p>
      </header>

      <MenuSetupForm currency={currency} />

      <footer className="text-muted-foreground text-xs">
        Operating <span className="text-foreground font-mono">{restaurant?.slug}</span>
      </footer>
    </main>
  );
}
