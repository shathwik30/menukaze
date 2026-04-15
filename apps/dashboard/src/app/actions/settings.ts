'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError, taxRuleSchema } from '@menukaze/shared';
import {
  actionError,
  validationError,
  withRestaurantAction,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const SETTINGS_PERMISSION_ERROR = 'You do not have permission to change this setting.';

// ────────────────────── Profile ──────────────────────

const profileInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  email: z.string().email().max(320).optional(),
  phone: z.string().max(40).optional(),
  logoUrl: z.string().url().max(2048).optional(),
  addressStructured: z.object({
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(120),
    state: z.string().max(120).optional(),
    postalCode: z.string().max(40).optional(),
    country: z.string().min(2).max(2),
  }),
});

export async function updateProfileAction(raw: unknown): Promise<ActionResult> {
  const parsed = profileInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(
      ['settings.edit_profile'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { Restaurant } = getModels(conn);
        const result = await Restaurant.updateOne(
          { _id: restaurantId },
          { $set: parsed.data },
        ).exec();
        if (result.matchedCount !== 1) throw new APIError('not_found');
        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'settings.profile.updated',
          resourceType: 'restaurant',
          resourceId: String(restaurantId),
          metadata: { fields: Object.keys(parsed.data) },
        });
        revalidatePath('/admin/settings');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to update profile.', SETTINGS_PERMISSION_ERROR);
  }
}

// ────────────────────── Hours ──────────────────────

const DAY_ENUM = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const hoursInput = z.object({
  hours: z
    .array(
      z.object({
        day: z.enum(DAY_ENUM),
        closed: z.boolean(),
        open: z.string().max(5).optional(),
        close: z.string().max(5).optional(),
      }),
    )
    .length(7),
});

export async function updateHoursAction(raw: unknown): Promise<ActionResult> {
  const parsed = hoursInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['settings.edit_hours'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      const hoursWithBreaks = parsed.data.hours.map((hour) => ({ ...hour, breaks: [] }));
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { hours: hoursWithBreaks } },
      ).exec();
      revalidatePath('/admin/settings');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to update hours.', SETTINGS_PERMISSION_ERROR);
  }
}

// ────────────────────── Holiday / Throttling ──────────────────────

const holidayInput = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
});
export async function updateHolidayModeAction(raw: unknown): Promise<ActionResult> {
  const parsed = holidayInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(
      ['settings.toggle_holiday'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { Restaurant } = getModels(conn);
        await Restaurant.updateOne(
          { _id: restaurantId },
          {
            $set: {
              'holidayMode.enabled': parsed.data.enabled,
              ...(parsed.data.message !== undefined
                ? { 'holidayMode.message': parsed.data.message }
                : {}),
            },
          },
        ).exec();
        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: parsed.data.enabled ? 'settings.holiday.enabled' : 'settings.holiday.disabled',
          resourceType: 'restaurant',
          resourceId: String(restaurantId),
        });
        revalidatePath('/admin/settings');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to update holiday mode.', SETTINGS_PERMISSION_ERROR);
  }
}

const throttlingInput = z.object({
  enabled: z.boolean(),
  maxConcurrentOrders: z.number().int().min(1).max(500),
});
export async function updateThrottlingAction(raw: unknown): Promise<ActionResult> {
  const parsed = throttlingInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['settings.edit_profile'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { throttling: parsed.data } },
      ).exec();
      revalidatePath('/admin/settings');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to update throttling.', SETTINGS_PERMISSION_ERROR);
  }
}

// ────────────────────── Delivery / Prep Time / Min Order ──────────────────────

const deliveryInput = z.object({
  estimatedPrepMinutes: z.number().int().min(1).max(600),
  minimumOrderMinor: z.number().int().min(0),
  deliveryFeeMinor: z.number().int().min(0),
});
export async function updateDeliverySettingsAction(raw: unknown): Promise<ActionResult> {
  const parsed = deliveryInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['settings.edit_delivery'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      await Restaurant.updateOne({ _id: restaurantId }, { $set: parsed.data }).exec();
      revalidatePath('/admin/settings');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to update delivery settings.', SETTINGS_PERMISSION_ERROR);
  }
}

// ────────────────────── QR Dine-In ──────────────────────

const qrDineInInput = z.object({
  dineInSessionTimeoutMinutes: z.number().int().min(30).max(720),
});
export async function updateQrDineInSettingsAction(raw: unknown): Promise<ActionResult> {
  const parsed = qrDineInInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['settings.edit_profile'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { dineInSessionTimeoutMinutes: parsed.data.dineInSessionTimeoutMinutes } },
      ).exec();
      revalidatePath('/admin/settings');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to update QR dine-in settings.', SETTINGS_PERMISSION_ERROR);
  }
}

// ────────────────────── Receipt Branding ──────────────────────

const brandingInput = z.object({
  headerColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  footerText: z.string().max(500).optional(),
  socials: z.array(z.string().url().max(300)).max(10).default([]),
});
export async function updateReceiptBrandingAction(raw: unknown): Promise<ActionResult> {
  const parsed = brandingInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['settings.edit_branding'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { receiptBranding: parsed.data } },
      ).exec();
      revalidatePath('/admin/settings');
      return { ok: true };
    });
  } catch (error) {
    return actionError(error, 'Failed to update receipt branding.', SETTINGS_PERMISSION_ERROR);
  }
}

// ────────────────────── Notifications ──────────────────────

const notifInput = z.object({
  email: z.boolean(),
  dashboard: z.boolean(),
  sound: z.boolean(),
});
export async function updateNotificationPrefsAction(raw: unknown): Promise<ActionResult> {
  const parsed = notifInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(['settings.edit_notifications'], async ({ restaurantId }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { notificationPrefs: parsed.data } },
      ).exec();
      revalidatePath('/admin/settings');
      return { ok: true };
    });
  } catch (error) {
    return actionError(
      error,
      'Failed to update notification preferences.',
      SETTINGS_PERMISSION_ERROR,
    );
  }
}

// ────────────────────── Tax Rules ──────────────────────

const taxRulesInput = z.object({
  taxRules: z.array(taxRuleSchema).max(10),
});
export async function updateTaxRulesAction(raw: unknown): Promise<ActionResult> {
  const parsed = taxRulesInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(
      ['settings.edit_profile'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { Restaurant } = getModels(conn);
        await Restaurant.updateOne(
          { _id: restaurantId },
          { $set: { taxRules: parsed.data.taxRules } },
        ).exec();
        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'settings.tax.updated',
          resourceType: 'restaurant',
          resourceId: String(restaurantId),
          metadata: { ruleCount: parsed.data.taxRules.length },
        });
        revalidatePath('/admin/settings');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to update tax rules.', SETTINGS_PERMISSION_ERROR);
  }
}
