import { NextResponse } from 'next/server';
import { channelPatterns } from '@menukaze/realtime';
import { createAblyTokenRequest } from '@menukaze/realtime/server';
import { requireOnboardedRestaurant } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { session } = await requireOnboardedRestaurant();
  const pattern = channelPatterns.allRestaurant(session.restaurantId);
  const tokenRequest = await createAblyTokenRequest(
    { [pattern]: ['subscribe', 'presence', 'history'] },
    `staff-${session.user.id}`,
  );
  return NextResponse.json(tokenRequest);
}
