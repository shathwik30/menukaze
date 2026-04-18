'use server';

import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError, type ActionResult } from '@menukaze/shared';
import { runRestaurantAction } from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

export type GoLiveResult = { ok: true; liveAt: string } | { ok: false; error: string };

const GO_LIVE_PERMISSION_ERROR = 'You do not have permission to activate this restaurant.';
const DISMISS_PERMISSION_ERROR = 'You do not have permission to dismiss the checklist.';

export async function goLiveAction(): Promise<GoLiveResult> {
  return runRestaurantAction(
    ['settings.edit_profile'],
    { onError: 'Failed to activate restaurant.', onForbidden: GO_LIVE_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
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

      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'restaurant.activated',
        resourceType: 'restaurant',
        resourceId: String(restaurantId),
        metadata: { liveAt: liveAt.toISOString() },
      });

      return { ok: true, liveAt: liveAt.toISOString() };
    },
  );
}

export async function dismissChecklistAction(): Promise<ActionResult> {
  return runRestaurantAction(
    ['settings.edit_profile'],
    { onError: 'Failed to dismiss the checklist.', onForbidden: DISMISS_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { checklistDismissed: true } },
      ).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'checklist.dismissed',
        resourceType: 'restaurant',
        resourceId: String(restaurantId),
      });
      return { ok: true } as const;
    },
  );
}

// `<form action>`-compatible wrapper: discards the result to match
// React's `(formData: FormData) => Promise<void>` signature.
export async function dismissChecklistFormAction(): Promise<void> {
  await dismissChecklistAction();
}
