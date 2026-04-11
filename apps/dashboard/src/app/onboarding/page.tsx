import { Types } from 'mongoose';
import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSession } from '@/lib/session';
import { RestaurantProfileForm } from './restaurant-profile-form';

/**
 * Onboarding root — wizard step 1 (Restaurant Profile) when the user has no
 * restaurant yet, or a state-aware redirect to the right next step.
 *
 * Wizard step routing:
 *   - No restaurant         → render the profile form (this page)
 *   - Restaurant, no items  → /onboarding/menu (step 2)
 *   - Items exist           → /admin (onboarding complete)
 */
export default async function OnboardingPage() {
  const session = await requireSession();

  if (session.restaurantId) {
    const conn = await getMongoConnection('live');
    const { Item } = getModels(conn);
    const itemCount = await Item.countDocuments({
      restaurantId: new Types.ObjectId(session.restaurantId),
    }).exec();
    if (itemCount > 0) redirect('/admin');
    redirect('/onboarding/menu');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 1 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">Tell us about your restaurant</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The country you pick locks in your currency, locale, tax format, and time zone. You can
          change every other field later.
        </p>
      </header>

      <RestaurantProfileForm />

      <footer className="text-muted-foreground text-xs">
        Signed in as <span className="text-foreground font-medium">{session.user.email}</span>
      </footer>
    </main>
  );
}
