import { NextResponse } from 'next/server';
import { channelPatterns } from '@menukaze/realtime';
import { createAblyTokenRequest } from '@menukaze/realtime/server';
import { requireOnboardedRestaurant } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Dashboard Ably token endpoint. Scopes the browser to every realtime
 * channel for the current restaurant via `restaurant.{id}.*`. Only signed-in
 * staff hit this route (requireOnboarded redirects anonymous users).
 */
export async function GET(): Promise<NextResponse> {
  const { session } = await requireOnboardedRestaurant();
  const pattern = channelPatterns.allRestaurant(session.restaurantId);
  const tokenRequest = await createAblyTokenRequest(
    { [pattern]: ['subscribe', 'presence', 'history'] },
    `staff-${session.user.id}`,
  );
  return NextResponse.json(tokenRequest);
}
