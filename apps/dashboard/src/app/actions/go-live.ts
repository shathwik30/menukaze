'use server';

import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError, type ActionResult } from '@menukaze/shared';
import { actionError, withRestaurantAction } from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

export type GoLiveResult = { ok: true; liveAt: string } | { ok: false; error: string };

const GO_LIVE_PERMISSION_ERROR = 'You do not have permission to activate this restaurant.';
const DISMISS_PERMISSION_ERROR = 'You do not have permission to dismiss the checklist.';

/**
 * Activates a restaurant after the required onboarding data exists.
 */
export async function goLiveAction(): Promise<GoLiveResult> {
  try {
    return await withRestaurantAction(
      ['settings.edit_profile'],
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
  } catch (error) {
    return actionError(error, 'Failed to activate restaurant.', GO_LIVE_PERMISSION_ERROR);
  }
}

/**
 * Hide the post-onboarding checklist card on /admin. Returns the standard
 * `ActionResult` envelope so client callers can show an error toast on
 * failure instead of silently dropping the click.
 */
export async function dismissChecklistAction(): Promise<ActionResult> {
  try {
    return await withRestaurantAction(
      ['settings.edit_profile'],
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
  } catch (error) {
    return actionError(error, 'Failed to dismiss the checklist.', DISMISS_PERMISSION_ERROR);
  }
}

/**
 * `<form action>`-compatible wrapper around {@link dismissChecklistAction}.
 * Discards the result so the function matches React's
 * `(formData: FormData) => Promise<void>` signature. The page rerenders
 * after the action, so a successful dismiss hides the card automatically;
 * a failed dismiss leaves the card visible for the user to retry.
 */
export async function dismissChecklistFormAction(): Promise<void> {
  await dismissChecklistAction();
}
