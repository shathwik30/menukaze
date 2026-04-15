'use server';

import { z } from 'zod';
import { getMongoConnection, getModels } from '@menukaze/db';
import { captureException } from '@menukaze/monitoring';
import { isReservationSlotValid } from '@menukaze/shared';
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
  slotStart: z.string().regex(/^\d{2}:\d{2}$/),
  slotEnd: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
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
  });
  if (!slotValidation.ok) return { ok: false, error: slotValidation.error };

  const status = settings.autoConfirm ? 'confirmed' : 'pending';

  const created = await Reservation.create({
    restaurantId: restaurant._id,
    name: input.name,
    email: input.email.toLowerCase(),
    ...(input.phone ? { phone: input.phone } : {}),
    partySize: input.partySize,
    date: input.date,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    ...(input.notes ? { notes: input.notes } : {}),
    status,
    autoConfirmed: status === 'confirmed',
  });

  try {
    await sendTransactionalEmail({
      to: input.email,
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
        ...(input.notes ? { notes: input.notes } : {}),
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
