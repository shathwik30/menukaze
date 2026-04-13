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

const planInput = z.object({
  name: z.string().min(1).max(120),
  monthlyMinor: z.number().int().min(0),
  commissionBps: z.number().int().min(0).max(10000),
  flatFeeMinor: z.number().int().min(0),
  features: z.array(z.string()).default([]),
  orderLimit: z.number().int().min(0).nullable().default(null),
  trialDays: z.number().int().min(0).default(14),
});

export async function createPlanAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = planInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { Plan } = getModels(conn);
      const plan = await Plan.create(parsed.data);

      await logPlatformAction(session.user.id, 'plan.create', 'plan', String(plan._id));

      return { ok: true as const, data: { id: String(plan._id) } };
    });
  } catch (error) {
    return actionError(error, 'Failed to create plan.');
  }
}

export async function updatePlanAction(planId: string, raw: unknown): Promise<ActionResult> {
  const parsed = planInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const oid = parseObjectId(planId);
  if (!oid) return invalidEntityError('plan');

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { Plan } = getModels(conn);
      const plan = await Plan.findByIdAndUpdate(oid, { $set: parsed.data }).exec();
      if (!plan) return invalidEntityError('plan');

      await logPlatformAction(session.user.id, 'plan.update', 'plan', planId);

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to update plan.');
  }
}

export async function retirePlanAction(planId: string): Promise<ActionResult> {
  const oid = parseObjectId(planId);
  if (!oid) return invalidEntityError('plan');

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { Plan } = getModels(conn);
      const plan = await Plan.findByIdAndUpdate(oid, { $set: { active: false } }).exec();
      if (!plan) return invalidEntityError('plan');

      await logPlatformAction(session.user.id, 'plan.retire', 'plan', planId);

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to retire plan.');
  }
}

export async function activatePlanAction(planId: string): Promise<ActionResult> {
  const oid = parseObjectId(planId);
  if (!oid) return invalidEntityError('plan');

  try {
    return await withSuperAdminAction(async ({ session }) => {
      const conn = await getMongoConnection('live');
      const { Plan } = getModels(conn);
      const plan = await Plan.findByIdAndUpdate(oid, { $set: { active: true } }).exec();
      if (!plan) return invalidEntityError('plan');

      await logPlatformAction(session.user.id, 'plan.activate', 'plan', planId);

      return { ok: true as const };
    });
  } catch (error) {
    return actionError(error, 'Failed to activate plan.');
  }
}
