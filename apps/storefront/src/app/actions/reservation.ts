'use server';

import { z } from 'zod';
import { enqueueWebhookEvent, getMongoConnection, getModels } from '@menukaze/db';
import { captureException } from '@menukaze/monitoring';
import { ACTIVE_RESERVATION_STATUSES, isReservationSlotValid } from '@menukaze/shared';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import { getZodErrorMessage } from '@menukaze/shared/validation';
import { ReservationConfirmationEmail } from '@/emails/reservation-confirmation';

const reservationInput = z.object({
  restaurantId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(320),
  phone: z
    .string()
    .min(7)
    .max(40)
    .regex(/^[\d\s+()\-.]+$/, 'Phone may only contain digits, spaces, and + ( ) - .')
    .optional(),
  partySize: z.number().int().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  slotEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  notes: z.string().trim().max(500).optional(),
});

export type CreateReservationResult =
  | {
      ok: true;
      reservationId: string;
      status: 'pending' | 'confirmed';
    }
  | { ok: false; error: string };

export async function createReservationAction(raw: unknown): Promise<CreateReservationResult> {
  const parsed = reservationInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: getZodErrorMessage(parsed.error, 'Please complete every field.') };
  }
  const input = parsed.data;
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim();
  const notes = input.notes?.trim();

  const conn = await getMongoConnection('live');
  const { Restaurant, Reservation } = getModels(conn);

  const restaurant = await Restaurant.findById(input.restaurantId).exec();
  if (!restaurant) return { ok: false, error: 'Restaurant not found.' };
  if (!restaurant.liveAt) {
    return { ok: false, error: 'This restaurant is not accepting reservations yet.' };
  }
  const settings = restaurant.reservationSettings;
  if (!settings?.enabled) {
    return { ok: false, error: 'Reservations are not available at this restaurant.' };
  }
  if (input.partySize > settings.maxPartySize) {
    return {
      ok: false,
      error: `Bookings are limited to ${settings.maxPartySize} guests. Call the restaurant for larger groups.`,
    };
  }

  const slotValidation = isReservationSlotValid({
    date: input.date,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    hours: restaurant.hours,
    settings,
    timeZone: restaurant.timezone,
    now: new Date(),
  });
  if (!slotValidation.ok) return { ok: false, error: slotValidation.error };

  const status = settings.autoConfirm ? 'confirmed' : 'pending';
  const existing = await Reservation.exists({
    restaurantId: restaurant._id,
    email,
    date: input.date,
    slotStart: input.slotStart,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
  });
  if (existing) {
    return {
      ok: false,
      error: 'You already have an active reservation request for this time.',
    };
  }

  const created = await Reservation.create({
    restaurantId: restaurant._id,
    name: input.name,
    email,
    ...(phone ? { phone } : {}),
    partySize: input.partySize,
    date: input.date,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    ...(notes ? { notes } : {}),
    status,
    autoConfirmed: status === 'confirmed',
  });

  await enqueueWebhookEvent(conn, {
    restaurantId: restaurant._id,
    eventType: 'reservation.created',
    data: {
      id: String(created._id),
      date: input.date,
      slot_start: input.slotStart,
      slot_end: input.slotEnd,
      party_size: input.partySize,
      status,
      customer: {
        name: input.name,
        email,
        ...(phone ? { phone } : {}),
      },
    },
  });

  try {
    await sendTransactionalEmail({
      to: email,
      subject:
        status === 'confirmed'
          ? `Reservation confirmed · ${restaurant.name}`
          : `Reservation request received · ${restaurant.name}`,
      react: ReservationConfirmationEmail({
        restaurantName: restaurant.name,
        customerName: input.name,
        date: input.date,
        slot: `${input.slotStart}–${input.slotEnd}`,
        partySize: input.partySize,
        status,
        ...(notes ? { notes } : {}),
      }),
    });
  } catch (error) {
    captureException(error, {
      surface: 'storefront:reservation',
      message: 'confirmation email failed',
    });
  }

  return { ok: true, reservationId: String(created._id), status };
}
