import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { enqueueWebhookEvent, getModels, getMongoConnection } from '@menukaze/db';
import {
  ACTIVE_RESERVATION_STATUSES,
  computeAvailableSlots,
  isReservationSlotValid,
} from '@menukaze/shared';
import { apiError, corsOptions, jsonOk, resolveApiKey, withApiCors } from '../_lib/auth';
import { withIdempotency } from '../_lib/idempotency';
import { rateLimitFor, rateLimitHeaders } from '../_lib/rate-limit';

export const dynamic = 'force-dynamic';

const reservationInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  slot_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  party_size: z.number().int().min(1).max(200),
  customer: z.object({
    name: z.string().trim().min(1).max(200),
    email: z.string().email().max(320),
    phone: z.string().trim().max(40).optional(),
  }),
  notes: z.string().trim().max(500).optional(),
});

export async function OPTIONS(request: NextRequest): Promise<Response> {
  return corsOptions(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request);
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:reservations:list');
  if (!rl.ok) {
    return withApiCors(
      request,
      apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
        headers: rateLimitHeaders(rl),
      }),
    );
  }
  const rateHeaders = rateLimitHeaders(rl);

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return withApiCors(request, apiError('invalid_request', 'Provide ?date=YYYY-MM-DD.'));
  }

  const conn = await getMongoConnection(ctx.dbName);
  const { Restaurant, Reservation } = getModels(conn);
  const restaurant = await Restaurant.findById(ctx.restaurantId).lean().exec();
  if (!restaurant) return withApiCors(request, apiError('not_found', 'Restaurant not found.'));
  if (!restaurant.liveAt) {
    return withApiCors(request, apiError('restaurant_closed', 'Reservations are not available.'));
  }
  const settings = restaurant.reservationSettings;
  if (!settings?.enabled) {
    return withApiCors(request, jsonOk({ date, available_slots: [] }, { headers: rateHeaders }));
  }
  const bookings = await Reservation.find(
    {
      restaurantId: ctx.restaurantId,
      date,
      status: { $in: ['pending', 'confirmed', 'seated', 'completed'] },
    },
    { date: 1, slotStart: 1, slotEnd: 1, partySize: 1, status: 1 },
  )
    .lean()
    .exec();
  const slots = computeAvailableSlots({
    date,
    hours: restaurant.hours,
    settings,
    bookings: bookings.map((b) => ({
      date: b.date,
      slotStart: b.slotStart,
      slotEnd: b.slotEnd,
      partySize: b.partySize,
      status: b.status,
    })),
    timeZone: restaurant.timezone,
    now: new Date(),
  });
  return withApiCors(
    request,
    jsonOk(
      {
        date,
        slot_minutes: settings.slotMinutes,
        buffer_minutes: settings.bufferMinutes,
        max_party_size: settings.maxPartySize,
        available_slots: slots.map((s) => ({
          slot_start: s.slotStart,
          slot_end: s.slotEnd,
          has_bookings: s.hasBookings,
        })),
      },
      { headers: rateHeaders },
    ),
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const ctx = await resolveApiKey(request, 'write');
  if (ctx instanceof Response) return ctx;

  const rl = await rateLimitFor(ctx, 'v1:reservations:create');
  if (!rl.ok) {
    return withApiCors(
      request,
      apiError('rate_limit_exceeded', 'Rate limit exceeded. See Retry-After.', {
        headers: rateLimitHeaders(rl),
      }),
    );
  }
  const rateHeaders = rateLimitHeaders(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withApiCors(request, apiError('invalid_request', 'Body must be valid JSON.'));
  }
  const parsed = reservationInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return withApiCors(
      request,
      apiError(
        'invalid_request',
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body.',
      ),
    );
  }
  const input = parsed.data;

  const conn = await getMongoConnection(ctx.dbName);
  return withApiCors(
    request,
    await withIdempotency({
      request,
      ctx,
      connection: conn,
      routeId: 'v1:reservations:create',
      body: input,
      handler: async () => {
        const { Restaurant, Reservation } = getModels(conn);
        const restaurant = await Restaurant.findById(ctx.restaurantId).exec();
        if (!restaurant) return apiError('not_found', 'Restaurant not found.');
        if (!restaurant.liveAt) {
          return apiError('restaurant_closed', 'Reservations are not available.');
        }
        const settings = restaurant.reservationSettings;
        if (!settings?.enabled) {
          return apiError('restaurant_closed', 'Reservations are not available.');
        }
        if (input.party_size > settings.maxPartySize) {
          return apiError('invalid_request', `Maximum party size is ${settings.maxPartySize}.`);
        }
        const slotValidation = isReservationSlotValid({
          date: input.date,
          slotStart: input.slot_start,
          slotEnd: input.slot_end,
          hours: restaurant.hours,
          settings,
          timeZone: restaurant.timezone,
          now: new Date(),
        });
        if (!slotValidation.ok) {
          return apiError('invalid_request', slotValidation.error);
        }

        const status = settings.autoConfirm ? 'confirmed' : 'pending';
        const email = input.customer.email.trim().toLowerCase();
        const phone = input.customer.phone?.trim();
        const notes = input.notes?.trim();
        const existing = await Reservation.exists({
          restaurantId: ctx.restaurantId,
          email,
          date: input.date,
          slotStart: input.slot_start,
          status: { $in: ACTIVE_RESERVATION_STATUSES },
        });
        if (existing) {
          return apiError(
            'invalid_request',
            'Customer already has an active reservation request for this time.',
          );
        }

        const created = await Reservation.create({
          restaurantId: ctx.restaurantId,
          name: input.customer.name,
          email,
          ...(phone ? { phone } : {}),
          partySize: input.party_size,
          date: input.date,
          slotStart: input.slot_start,
          slotEnd: input.slot_end,
          ...(notes ? { notes } : {}),
          status,
          autoConfirmed: status === 'confirmed',
        });

        await enqueueWebhookEvent(conn, {
          restaurantId: ctx.restaurantId,
          eventType: 'reservation.created',
          data: {
            id: String(created._id),
            date: input.date,
            slot_start: input.slot_start,
            slot_end: input.slot_end,
            party_size: input.party_size,
            status,
            customer: {
              name: input.customer.name,
              email,
              ...(phone ? { phone } : {}),
            },
          },
        });

        return jsonOk(
          {
            id: String(created._id),
            date: input.date,
            slot_start: input.slot_start,
            slot_end: input.slot_end,
            party_size: input.party_size,
            status,
          },
          { status: 201, headers: rateHeaders },
        );
      },
    }),
  );
}
