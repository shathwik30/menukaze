'use server';

import { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';

export type GoLiveResult = { ok: true; liveAt: string } | { ok: false; error: string };

/**
 * Step 8 of the onboarding wizard — activate the restaurant.
 *
 * Advances onboardingStep → 'complete' and stamps `liveAt`. Requires:
 *   - current step === 'go-live'
 *   - at least one menu item exists
 *
 * Razorpay is soft-required: the storefront will show "Coming Soon" on
 * checkout if `razorpayKeyIdEnc` isn't set, but Go Live still works so
 * the user can preview their storefront without payment first.
 */
export async function goLiveAction(): Promise<GoLiveResult> {
  const session = await requireOnboarded();
  const conn = await getMongoConnection('live');
  const { Restaurant, Item } = getModels(conn);
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  if (restaurant.onboardingStep !== 'go-live') {
    return { ok: false, error: 'Restaurant is not on the Go Live step.' };
  }

  const itemCount = await Item.countDocuments({ restaurantId }).exec();
  if (itemCount === 0) {
    return { ok: false, error: 'Add at least one menu item before going live.' };
  }

  const liveAt = new Date();
  const result = await Restaurant.updateOne(
    { _id: restaurantId },
    { $set: { onboardingStep: 'complete', liveAt } },
  ).exec();
  if (result.matchedCount !== 1) throw new APIError('internal_error');

  return { ok: true, liveAt: liveAt.toISOString() };
}

/**
 * Hide the post-onboarding checklist card on /admin.
 * Used as a `<form action>` — returns void so Next.js accepts the signature.
 */
export async function dismissChecklistAction(): Promise<void> {
  const session = await requireOnboarded();
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  await Restaurant.updateOne(
    { _id: new Types.ObjectId(session.restaurantId) },
    { $set: { checklistDismissed: true } },
  ).exec();
}
