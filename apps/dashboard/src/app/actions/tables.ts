'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { generateQrToken, getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { requireOnboarded } from '@/lib/session';

const inputSchema = z
  .object({
    hasTables: z.enum(['yes', 'no']),
    tableCount: z.number().int().min(1).max(200).optional(),
  })
  .refine(
    (data) =>
      data.hasTables === 'no' || (typeof data.tableCount === 'number' && data.tableCount >= 1),
    { message: 'Provide a table count when hasTables is yes.' },
  );

export type CreateTablesStarterInput = z.infer<typeof inputSchema>;

export type CreateTablesStarterResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * Step 5 of the onboarding wizard — Tables + QR Codes.
 *
 * If hasTables=yes and tableCount=N, creates N tables numbered 1..N with a
 * random 24-char URL-safe `qrToken` on each (printed on the physical QR
 * sticker). If hasTables=no the action creates zero tables but still
 * advances `onboardingStep` so the wizard moves on.
 *
 * Idempotent re-onboarding: if the restaurant has already been through the
 * tables step (onboardingStep is past 'tables'), the action no-ops.
 */
export async function createTablesStarterAction(raw: unknown): Promise<CreateTablesStarterResult> {
  const session = await requireOnboarded();

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
  const { Restaurant, Table } = getModels(conn);
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const restaurant = await Restaurant.findById(restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

  // Re-onboarding guard
  if (restaurant.onboardingStep !== 'tables') {
    return { ok: false, error: 'This restaurant has already completed the tables step.' };
  }

  const dbSession = await conn.startSession();
  try {
    let created = 0;
    await dbSession.withTransaction(async () => {
      if (input.hasTables === 'yes' && input.tableCount) {
        const tables = Array.from({ length: input.tableCount }, (_, index) => {
          const number = index + 1;
          return {
            restaurantId,
            number,
            name: `Table ${number}`,
            capacity: 4,
            qrToken: generateQrToken(),
            status: 'available' as const,
          };
        });
        const result = await Table.create(tables, { session: dbSession, ordered: true });
        created = result.length;
      }

      const updateResult = await Restaurant.updateOne(
        { _id: restaurantId },
        { $set: { onboardingStep: 'razorpay' } },
        { session: dbSession },
      ).exec();
      if (updateResult.matchedCount !== 1) throw new APIError('internal_error');
    });

    return { ok: true, created };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return { ok: false, error: `Could not save tables: ${message}` };
  } finally {
    await dbSession.endSession();
  }
}
