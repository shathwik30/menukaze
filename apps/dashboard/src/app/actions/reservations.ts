'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { enqueueWebhookEvent, getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import {
  invalidEntityError,
  runRestaurantAction,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { recordAudit } from '@/lib/audit';

const RESERVATION_PERMISSION_ERROR = 'You do not have permission to manage reservations.';
const SETTINGS_PERMISSION_ERROR = 'You do not have permission to configure reservations.';

const STATUS_TARGETS = ['confirmed', 'cancelled', 'seated', 'no_show', 'completed'] as const;
const ALLOWED_TRANSITIONS: Record<string, Set<(typeof STATUS_TARGETS)[number]>> = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['seated', 'no_show', 'cancelled']),
  seated: new Set(['completed']),
  cancelled: new Set([]),
  no_show: new Set([]),
  completed: new Set([]),
};

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

  return runRestaurantAction(
    ['reservations.edit'],
    { onError: 'Failed to update reservation.', onForbidden: RESERVATION_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Reservation } = getModels(conn);
      const reservation = await Reservation.findOne({ restaurantId, _id: reservationId }).exec();
      if (!reservation) throw new Error('Reservation not found.');
      if (!ALLOWED_TRANSITIONS[reservation.status]?.has(parsed.data.status)) {
        throw new Error(
          `Cannot move reservation from ${reservation.status.replace(/_/g, ' ')} to ${parsed.data.status.replace(/_/g, ' ')}.`,
        );
      }
      const update: Record<string, unknown> = { status: parsed.data.status };
      const unset: Record<string, 1> = {};
      if (parsed.data.status === 'cancelled' && parsed.data.cancelReason) {
        update.cancelReason = parsed.data.cancelReason;
      } else if (parsed.data.status !== 'cancelled') {
        unset.cancelReason = 1;
      }
      const updateCommand: Record<string, unknown> = { $set: update };
      if (Object.keys(unset).length > 0) updateCommand['$unset'] = unset;
      await Reservation.updateOne({ restaurantId, _id: reservationId }, updateCommand).exec();
      if (parsed.data.status === 'cancelled') {
        await enqueueWebhookEvent(conn, {
          restaurantId,
          eventType: 'reservation.cancelled',
          data: {
            id: String(reservation._id),
            date: reservation.date,
            slot_start: reservation.slotStart,
            slot_end: reservation.slotEnd,
            party_size: reservation.partySize,
            status: 'cancelled',
            ...(parsed.data.cancelReason ? { cancel_reason: parsed.data.cancelReason } : {}),
            customer: {
              name: reservation.name,
              email: reservation.email,
              ...(reservation.phone ? { phone: reservation.phone } : {}),
            },
          },
        });
      }
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

export async function deleteReservationAction(raw: unknown): Promise<ActionResult> {
  const parsed = z.object({ reservationId: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const reservationId = parseObjectId(parsed.data.reservationId);
  if (!reservationId) return invalidEntityError('reservation');

  return runRestaurantAction(
    ['reservations.edit'],
    { onError: 'Failed to delete reservation.', onForbidden: RESERVATION_PERMISSION_ERROR },
    async ({ restaurantId, session, role }) => {
      const conn = await getMongoConnection('live');
      const { Reservation } = getModels(conn);
      const reservation = await Reservation.findOne({ restaurantId, _id: reservationId }).exec();
      if (!reservation) throw new Error('Reservation not found.');
      await Reservation.deleteOne({ restaurantId, _id: reservationId }).exec();
      await recordAudit({
        restaurantId,
        userId: session.user.id,
        userEmail: session.user.email,
        role,
        action: 'reservation.deleted',
        resourceType: 'reservation',
        resourceId: String(reservationId),
        metadata: { name: reservation.name, date: reservation.date, status: reservation.status },
      });
      revalidatePath('/admin/reservations');
      return { ok: true };
    },
  );
}

export async function updateReservationSettingsAction(raw: unknown): Promise<ActionResult> {
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  return runRestaurantAction(
    ['reservations.configure'],
    { onError: 'Failed to update reservation settings.', onForbidden: SETTINGS_PERMISSION_ERROR },
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
}
