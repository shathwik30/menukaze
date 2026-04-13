'use server';

import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import {
  type ActionResult,
  actionError,
  validationError,
  invalidEntityError,
  withSuperAdminAction,
} from '@/lib/action-helpers';
import { logPlatformAction } from '@/lib/audit';

const statusInput = z.enum(['active', 'suspended', 'cancelled']);

export async function updateMerchantStatusAction(
  merchantId: string,
  rawStatus: string,
): Promise<ActionResult> {
  const parsed = statusInput.safeParse(rawStatus);
  if (!parsed.success) return validationError(parsed.error);

  const oid = parseObjectId(merchantId);
  if (!oid) return invalidEntityError('merchant');

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      const restaurant = await Restaurant.findById(oid).exec();
      if (!restaurant) return invalidEntityError('merchant');

      const prev = restaurant.subscriptionStatus;
      restaurant.subscriptionStatus = parsed.data;
      await restaurant.save();

      await logPlatformAction(
        session.user.id,
        `merchant.${parsed.data}`,
        'restaurant',
        merchantId,
        {
          targetRestaurantId: merchantId,
          diff: { subscriptionStatus: { from: prev, to: parsed.data } },
        },
      );

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to update merchant status.');
  }
}
