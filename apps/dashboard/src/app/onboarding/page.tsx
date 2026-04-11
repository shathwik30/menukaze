import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { RestaurantProfileForm } from './restaurant-profile-form';

/**
 * Step 3 of the onboarding wizard — Restaurant Profile.
 *
 * Guards:
 *   - Must be signed in → redirect to /login otherwise.
 *   - Must NOT already have a restaurant → bounce to /admin if they do.
 */
export default async function OnboardingPage() {
  const session = await requireSession();
  if (session.restaurantId) redirect('/admin');

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
