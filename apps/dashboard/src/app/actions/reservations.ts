'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import {
  actionError,
  invalidEntityError,
  validationError,
  withRestaurantAction,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const RESERVATION_PERMISSION_ERROR = 'You do not have permission to manage reservations.';
const SETTINGS_PERMISSION_ERROR = 'You do not have permission to configure reservations.';

const STATUS_TARGETS = ['confirmed', 'cancelled', 'seated', 'no_show', 'completed'] as const;

const statusInput = z.object({
  reservationId: z.string().min(1),
  status: z.enum(STATUS_TARGETS),
  cancelReason: z.string().max(500).optional(),
});

export async function updateReservationStatusAction(raw: unknown): Promise<ActionResult> {
  const parsed = statusInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const reservationId = parseObjectId(parsed.data.reservationId);
  if (!reservationId) return invalidEntityError('reservation');

  try {
    return await withRestaurantAction(
      ['reservations.edit'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { Reservation } = getModels(conn);
        const reservation = await Reservation.findOne({ restaurantId, _id: reservationId }).exec();
        if (!reservation) throw new Error('Reservation not found.');
        if (reservation.status === 'cancelled' && parsed.data.status !== 'cancelled') {
          throw new Error('Cancelled reservations cannot be reopened.');
        }
        const update: Record<string, unknown> = { status: parsed.data.status };
        if (parsed.data.status === 'cancelled' && parsed.data.cancelReason) {
          update.cancelReason = parsed.data.cancelReason;
        }
        await Reservation.updateOne({ restaurantId, _id: reservationId }, { $set: update }).exec();
        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'reservation.status.updated',
          resourceType: 'reservation',
          resourceId: String(reservationId),
          metadata: { from: reservation.status, to: parsed.data.status },
        });
        revalidatePath('/admin/reservations');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to update reservation.', RESERVATION_PERMISSION_ERROR);
  }
}

const settingsInput = z.object({
  enabled: z.boolean(),
  slotMinutes: z.number().int().min(15).max(240),
  maxPartySize: z.number().int().min(1).max(200),
  bufferMinutes: z.number().int().min(0).max(120),
  autoConfirm: z.boolean(),
  reminderHours: z.number().int().min(0).max(168),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
});

export async function updateReservationSettingsAction(raw: unknown): Promise<ActionResult> {
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    return await withRestaurantAction(
      ['reservations.configure'],
      async ({ restaurantId, session, role }) => {
        const conn = await getMongoConnection('live');
        const { Restaurant } = getModels(conn);
        await Restaurant.updateOne(
          { _id: restaurantId },
          { $set: { reservationSettings: parsed.data } },
        ).exec();
        await recordAudit({
          restaurantId,
          userId: session.user.id,
          userEmail: session.user.email,
          role,
          action: 'reservation.settings.updated',
          resourceType: 'restaurant',
          resourceId: String(restaurantId),
          metadata: {
            enabled: parsed.data.enabled,
            slotMinutes: parsed.data.slotMinutes,
            blockedDates: parsed.data.blockedDates.length,
          },
        });
        revalidatePath('/admin/reservations');
        revalidatePath('/admin/reservations/settings');
        return { ok: true };
      },
    );
  } catch (error) {
    return actionError(error, 'Failed to update reservation settings.', SETTINGS_PERMISSION_ERROR);
  }
}
