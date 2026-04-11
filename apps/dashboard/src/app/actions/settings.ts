'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import type { Flag } from '@menukaze/rbac';
import { PermissionDeniedError, requireFlags } from '@/lib/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

function zodError(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input.';
}

async function withRestaurantId<T>(
  flags: Flag[],
  handler: (restaurantId: Types.ObjectId) => Promise<T | { ok: false; error: string }>,
): Promise<T | { ok: false; error: string }> {
  try {
    const { session } = await requireFlags(flags);
    return await handler(new Types.ObjectId(session.restaurantId));
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: 'You do not have permission to change this setting.' };
    }
    throw error;
  }
}

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
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.edit_profile'], async (restaurantId) => {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    const result = await Restaurant.updateOne({ _id: restaurantId }, { $set: parsed.data }).exec();
    if (result.matchedCount !== 1) throw new APIError('not_found');
    revalidatePath('/admin/settings');
    return { ok: true };
  });
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
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.edit_hours'], async (restaurantId) => {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    const hoursWithBreaks = parsed.data.hours.map((h) => ({ ...h, breaks: [] }));
    await Restaurant.updateOne({ _id: restaurantId }, { $set: { hours: hoursWithBreaks } }).exec();
    revalidatePath('/admin/settings');
    return { ok: true };
  });
}

// ────────────────────── Holiday / Throttling ──────────────────────

const holidayInput = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
});
export async function updateHolidayModeAction(raw: unknown): Promise<ActionResult> {
  const parsed = holidayInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.toggle_holiday'], async (restaurantId) => {
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
    revalidatePath('/admin/settings');
    return { ok: true };
  });
}

const throttlingInput = z.object({
  enabled: z.boolean(),
  maxConcurrentOrders: z.number().int().min(1).max(500),
});
export async function updateThrottlingAction(raw: unknown): Promise<ActionResult> {
  const parsed = throttlingInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.edit_profile'], async (restaurantId) => {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    await Restaurant.updateOne({ _id: restaurantId }, { $set: { throttling: parsed.data } }).exec();
    revalidatePath('/admin/settings');
    return { ok: true };
  });
}

// ────────────────────── Delivery / Prep Time / Min Order ──────────────────────

const deliveryInput = z.object({
  estimatedPrepMinutes: z.number().int().min(1).max(600),
  minimumOrderMinor: z.number().int().min(0),
  deliveryFeeMinor: z.number().int().min(0),
});
export async function updateDeliverySettingsAction(raw: unknown): Promise<ActionResult> {
  const parsed = deliveryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.edit_delivery'], async (restaurantId) => {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    await Restaurant.updateOne({ _id: restaurantId }, { $set: parsed.data }).exec();
    revalidatePath('/admin/settings');
    return { ok: true };
  });
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
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.edit_branding'], async (restaurantId) => {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    await Restaurant.updateOne(
      { _id: restaurantId },
      { $set: { receiptBranding: parsed.data } },
    ).exec();
    revalidatePath('/admin/settings');
    return { ok: true };
  });
}

// ────────────────────── Notifications ──────────────────────

const notifInput = z.object({
  email: z.boolean(),
  dashboard: z.boolean(),
  sound: z.boolean(),
});
export async function updateNotificationPrefsAction(raw: unknown): Promise<ActionResult> {
  const parsed = notifInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  return withRestaurantId(['settings.edit_notifications'], async (restaurantId) => {
    const conn = await getMongoConnection('live');
    const { Restaurant } = getModels(conn);
    await Restaurant.updateOne(
      { _id: restaurantId },
      { $set: { notificationPrefs: parsed.data } },
    ).exec();
    revalidatePath('/admin/settings');
    return { ok: true };
  });
}
