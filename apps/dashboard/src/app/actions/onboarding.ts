'use server';

import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { APIError, slugSchema } from '@menukaze/shared';
import { runRestaurantAction, validationError, type ActionResult } from '@/lib/action-helpers';
import { requireSession } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

const inputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  country: z.enum(['IN', 'US', 'GB', 'AE', 'SG', 'AU', 'CA', 'DE', 'FR', 'JP']),
  currency: z.string().min(3).max(3),
  locale: z.string().min(2).max(10),
  timezone: z.string().min(3).max(64),
  addressStructured: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().length(2),
  }),
});

export type CreateRestaurantInput = z.infer<typeof inputSchema>;

export type CreateRestaurantResult =
  | { ok: true; restaurantId: string }
  | { ok: false; error: string };

export async function createRestaurantAction(raw: unknown): Promise<CreateRestaurantResult> {
  const session = await requireSession();
  if (session.restaurantId) {
    return { ok: false, error: 'You already have a restaurant on this account.' };
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error, 'Invalid form data.');
  const input = parsed.data;
  const userId = parseObjectId(session.user.id);
  if (!userId) return { ok: false, error: 'Unknown user.' };

  const conn = await getMongoConnection('live');
  const { Restaurant, StaffMembership } = getModels(conn);

  // Cheap pre-check avoids an opaque duplicate-key error later in the transaction.
  const existing = await Restaurant.findOne({ slug: input.slug }, { _id: 1 }).exec();
  if (existing) {
    return { ok: false, error: `The subdomain "${input.slug}" is already taken.` };
  }

  const dbSession = await conn.startSession();
  try {
    let restaurantId: string | null = null;
    await dbSession.withTransaction(async () => {
      const [restaurant] = await Restaurant.create(
        [
          {
            slug: input.slug,
            name: input.name,
            country: input.country,
            currency: input.currency,
            locale: input.locale,
            timezone: input.timezone,
            addressStructured: input.addressStructured,
            geo: { type: 'Point', coordinates: [0, 0] },
            wifiPublicIps: [],
            hours: [],
            subscriptionStatus: 'trial',
            dineInSessionTimeoutMinutes: 180,
            geofenceRadiusM: 100,
            hardening: {
              strictMode: false,
              wifiGate: false,
              firstOrderDelayS: 0,
              maxSessionsPerTable: 1,
              geofenceRadiusM: 100,
            },
            taxRules: [],
            receiptBranding: { socials: [] },
            notificationPrefs: { email: true, dashboard: true, sound: true },
          },
        ],
        { session: dbSession },
      );
      if (!restaurant) throw new APIError('internal_error');
      restaurantId = String(restaurant._id);

      await StaffMembership.create(
        [
          {
            restaurantId: restaurant._id,
            userId,
            role: 'owner',
            status: 'active',
          },
        ],
        { session: dbSession },
      );
    });

    if (!restaurantId) {
      return { ok: false, error: 'Could not create the restaurant. Please try again.' };
    }
    await recordAudit({
      restaurantId,
      userId: session.user.id,
      userEmail: session.user.email,
      role: 'owner',
      action: 'restaurant.created',
      resourceType: 'restaurant',
      resourceId: restaurantId,
      metadata: { slug: input.slug, country: input.country, currency: input.currency },
    });
    return { ok: true, restaurantId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    if (/duplicate key/i.test(message) && /slug/i.test(message)) {
      return { ok: false, error: `The subdomain "${input.slug}" is already taken.` };
    }
    return { ok: false, error: `Could not create the restaurant: ${message}` };
  } finally {
    await dbSession.endSession();
  }
}

export async function completeStaffStepAction(): Promise<ActionResult> {
  return runRestaurantAction(
    ['settings.edit_profile'],
    { onError: 'Failed to advance onboarding.' },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant } = getModels(conn);
      const restaurant = await Restaurant.findById(restaurantId).exec();
      if (!restaurant) throw new Error('Restaurant not found.');
      if (restaurant.onboardingStep !== 'staff') {
        throw new Error('This restaurant has already moved past the staff step.');
      }
      await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { onboardingStep: 'go-live' } },
      ).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'onboarding.staff.skipped',
        resourceType: 'restaurant',
        resourceId: String(restaurantId),
      });
      return { ok: true };
    },
  );
}
