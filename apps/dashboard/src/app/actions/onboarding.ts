'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { APIError, slugSchema } from '@menukaze/shared';
import { requireSession } from '@/lib/session';

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

/**
 * Onboarding Step 3 — create the restaurant + the owner's StaffMembership.
 *
 * - Authed users only (redirects to /login otherwise).
 * - Refuses if the caller already has a restaurant (race / re-onboarding).
 * - Slug uniqueness is enforced by the unique index on `restaurants.slug`;
 *   we surface the duplicate as a friendly error rather than a 500.
 * - Inserts the restaurant and the owner membership atomically inside a
 *   Mongoose session.
 */
export async function createRestaurantAction(raw: unknown): Promise<CreateRestaurantResult> {
  const session = await requireSession();
  if (session.restaurantId) {
    return { ok: false, error: 'You already have a restaurant on this account.' };
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid form data.',
    };
  }
  const input = parsed.data;

  const conn = await getMongoConnection('live');
  const { Restaurant, StaffMembership } = getModels(conn);

  // Pre-check the slug for a friendlier error than the unique-index throw.
  const existing = await Restaurant.findOne({ slug: input.slug }, { _id: 1 }).exec();
  if (existing) {
    return { ok: false, error: `The subdomain "${input.slug}" is already taken.` };
  }

  const dbSession = await conn.startSession();
  try {
    let restaurantId: Types.ObjectId | null = null;
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
      restaurantId = restaurant._id as Types.ObjectId;

      await StaffMembership.create(
        [
          {
            restaurantId,
            userId: new Types.ObjectId(session.user.id),
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
    return { ok: true, restaurantId: String(restaurantId) };
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
