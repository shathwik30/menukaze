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

const createFlagInput = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
});

export async function createFlagAction(raw: unknown): Promise<ActionResult<{ key: string }>> {
  const parsed = createFlagInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { FeatureFlag } = getModels(conn);
      await FeatureFlag.create(parsed.data);

      await logPlatformAction(session.user.id, 'flag.create', 'feature_flag', parsed.data.key);

      return { ok: true as const, data: { key: parsed.data.key } };
    });
  } catch (error) {
    return actionError(error, 'Failed to create feature flag.');
  }
}

export async function toggleGlobalFlagAction(key: string, enabled: boolean): Promise<ActionResult> {
  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { FeatureFlag } = getModels(conn);
      const flag = await FeatureFlag.findOneAndUpdate(
        { key },
        { $set: { globallyEnabled: enabled } },
      ).exec();
      if (!flag) return invalidEntityError('feature flag');

      await logPlatformAction(session.user.id, 'flag.toggle', 'feature_flag', key, {
        diff: { globallyEnabled: { from: !enabled, to: enabled } },
      });

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to toggle feature flag.');
  }
}

export async function setFlagOverrideAction(
  key: string,
  restaurantId: string,
  value: boolean | null,
): Promise<ActionResult> {
  if (!parseObjectId(restaurantId) && value !== null) return invalidEntityError('restaurant');

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { FeatureFlag } = getModels(conn);

      const update =
        value === null
          ? { $unset: { [`restaurantOverrides.${restaurantId}`]: '' } }
          : { $set: { [`restaurantOverrides.${restaurantId}`]: value } };

      const flag = await FeatureFlag.findOneAndUpdate({ key }, update).exec();
      if (!flag) return invalidEntityError('feature flag');

      await logPlatformAction(session.user.id, 'flag.override', 'feature_flag', key, {
        targetRestaurantId: restaurantId,
        diff: { restaurantId, value },
      });

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to update flag override.');
  }
}

export async function updateFlagPlanGatesAction(
  key: string,
  planIds: string[],
): Promise<ActionResult> {
  const oids = planIds.map((id) => parseObjectId(id)).filter(Boolean);

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { FeatureFlag } = getModels(conn);
      const flag = await FeatureFlag.findOneAndUpdate(
        { key },
        { $set: { planGates: oids } },
      ).exec();
      if (!flag) return invalidEntityError('feature flag');

      await logPlatformAction(session.user.id, 'flag.plan_gates', 'feature_flag', key, {
        diff: { planIds },
      });

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to update plan gates.');
  }
}

export async function deleteFlagAction(key: string): Promise<ActionResult> {
  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { FeatureFlag } = getModels(conn);
      const flag = await FeatureFlag.findOneAndDelete({ key }).exec();
      if (!flag) return invalidEntityError('feature flag');

      await logPlatformAction(session.user.id, 'flag.delete', 'feature_flag', key);

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to delete feature flag.');
  }
}
