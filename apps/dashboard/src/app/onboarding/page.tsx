import { Types } from 'mongoose';
import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireSession } from '@/lib/session';
import { RestaurantProfileForm } from './restaurant-profile-form';

/**
 * Onboarding root — wizard entry point.
 *
 * Routing map (reads `restaurant.onboardingStep`):
 *   no restaurant        → render the profile form (step 1)
 *   step === 'menu'      → 307 → /onboarding/menu
 *   step === 'tables'    → 307 → /onboarding/tables
 *   step === 'razorpay'  → 307 → /onboarding/razorpay
 *   step === 'go-live'   → 307 → /onboarding/go-live
 *   step === 'complete'  → 307 → /admin
 */
export default async function OnboardingPage() {
  const session = await requireSession();

  if (session.restaurantId) {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    const restaurant = await Restaurant.findById(new Types.ObjectId(session.restaurantId)).exec();
    const step = restaurant?.onboardingStep ?? 'menu';
    switch (step) {
      case 'menu':
        redirect('/onboarding/menu');
        break;
      case 'tables':
        redirect('/onboarding/tables');
        break;
      case 'razorpay':
        redirect('/onboarding/razorpay');
        break;
      case 'go-live':
        redirect('/onboarding/go-live');
        break;
      default:
        redirect('/admin');
    }
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
