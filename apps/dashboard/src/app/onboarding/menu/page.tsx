import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requirePageFlag } from '@/lib/session';
import { MenuSetupForm } from './menu-setup-form';

export const dynamic = 'force-dynamic';

/**
 * Menu setup page for the onboarding flow.
 */
export default async function OnboardingMenuPage() {
  const { restaurantId } = await requirePageFlag(['menu.edit']);

  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) redirect('/onboarding');

  if (restaurant.onboardingStep !== 'menu') {
    redirect('/onboarding');
  }

  const currency = restaurant.currency;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">Step 2 of 6</p>
        <h1 className="mt-1 text-3xl font-bold">Add your first menu items</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Create menu items manually or import a CSV from your spreadsheet. You can add more
          categories, modifiers, variants, and images later from the Menu Management dashboard.
        </p>
      </header>

      <MenuSetupForm currency={currency} />

      <footer className="text-muted-foreground text-xs">
        Operating <span className="text-foreground font-mono">{restaurant.slug}</span>
      </footer>
    </main>
  );
}
