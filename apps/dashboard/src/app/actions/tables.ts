'use server';

import { z } from 'zod';
import { generateQrToken, getMongoConnection, getModels } from '@menukaze/db';
import { APIError } from '@menukaze/shared';
import { runRestaurantAction, validationError } from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const TABLES_PERMISSION_ERROR = 'You do not have permission to set up tables.';

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

export async function createTablesStarterAction(raw: unknown): Promise<CreateTablesStarterResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error, 'Invalid form data.');
  const input = parsed.data;

  return runRestaurantAction(
    ['tables.edit'],
    { onError: 'Could not save tables.', onForbidden: TABLES_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Restaurant, Table } = getModels(conn);

      const restaurant = await Restaurant.findById(restaurantId).exec();
      if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

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

        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'onboarding.tables.completed',
          resourceType: 'restaurant',
          resourceId: String(restaurantId),
          metadata: { hasTables: input.hasTables, created },
        });
        return { ok: true, created };
      } finally {
        await dbSession.endSession();
      }
    },
  );
}
