'use server';

import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { PermissionDeniedError, requireFlags } from '@/lib/session';

export type GoLiveResult = { ok: true; liveAt: string } | { ok: false; error: string };

/**
 * Activates a restaurant after the required onboarding data exists.
 */
export async function goLiveAction(): Promise<GoLiveResult> {
  let restaurantId;
  try {
    ({ restaurantId } = await requireFlags(['settings.edit_profile']));
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: 'You do not have permission to activate this restaurant.' };
    }
    throw error;
  }
  const conn = await getMongoConnection('live');
  const { Restaurant, Item } = getModels(conn);

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
 */
export async function dismissChecklistAction(): Promise<void> {
  const { restaurantId } = await requireFlags(['settings.edit_profile']);
  const conn = await getMongoConnection('live');
  const { Restaurant } = getModels(conn);
  await Restaurant.updateOne({ _id: restaurantId }, { $set: { checklistDismissed: true } }).exec();
}
