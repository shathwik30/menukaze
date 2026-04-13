import Link from 'next/link';
import { headers } from 'next/headers';
import { getMongoConnection, getModels } from '@menukaze/db';
import { resolveTenantOrNotFound } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function AttractScreen() {
  const restaurant = await resolveTenantOrNotFound();

  const h = await headers();
  const nonce = h.get('x-nonce') ?? undefined;

  // Derive a nice background from the logo or fall back to a gradient
  const logoUrl = restaurant.logoUrl;

  // Suppress noise: fetch active item count to show "N items available"
  let itemCount = 0;
  try {
    const conn = await getMongoConnection('live');
    const { Item } = getModels(conn);
    itemCount = await Item.countDocuments({ restaurantId: restaurant._id, soldOut: false });
  } catch {
    // Non-fatal
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Subtle JSON-LD for PWA install hint */}
      <script
        nonce={nonce}
        type="application/json"
        id="kiosk-meta"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ restaurant: restaurant.name }),
        }}
      />

      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={restaurant.name}
          className="h-24 w-24 rounded-2xl object-cover shadow-2xl"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/10 text-4xl font-bold shadow-2xl">
          {restaurant.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="text-center">
        <h1 className="text-6xl font-extrabold tracking-tight">{restaurant.name}</h1>
        {itemCount > 0 ? (
          <p className="mt-3 text-xl text-white/60">{itemCount} items available</p>
        ) : null}
      </div>

      <Link
        href="/kiosk/mode"
        className="mt-4 inline-flex h-20 w-72 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-slate-900 shadow-xl transition-transform active:scale-95"
      >
        Tap to Order
      </Link>

      <p className="text-sm text-white/40">Touch the button above to start</p>

      {/* Hidden staff exit button — 5 quick taps on corner to reveal PIN */}
      <ExitButton />
    </main>
  );
}

function ExitButton() {
  // Rendered as a client island via a separate file to keep the attract
  // screen itself as a pure RSC. Imported inline to avoid an extra file.
  return (
    <div
      id="kiosk-exit-trigger"
      className="absolute right-0 top-0 h-16 w-16 cursor-default"
      aria-hidden="true"
    />
  );
}
