import { getMongoConnection, getModels, type ReservationDoc } from '@menukaze/db';
import { captureException } from '@menukaze/monitoring';
import {
  dateKeyInTimezone,
  localDateTimeInTimezoneToUtc,
  ReservationReminderEmail,
} from '@menukaze/shared';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';

interface ReminderResult {
  restaurants: number;
  scanned: number;
  sent: number;
  failed: number;
}

interface RestaurantReminderSettings {
  enabled: boolean;
  reminderHours: number;
}

interface ReminderRestaurant {
  _id: ReservationDoc['restaurantId'];
  name: string;
  email?: string;
  locale?: string;
  timezone?: string;
  reservationSettings?: RestaurantReminderSettings;
}

type ReminderReservation = ReservationDoc & { _id: ReservationDoc['restaurantId'] };

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_LOCALE = 'en-US';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDateLabel(value: Date, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function formatTimeLabel(value: Date, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function timeKeyInTimezone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(value);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

export async function sendReservationReminders(
  batchSize = DEFAULT_BATCH_SIZE,
  now = new Date(),
): Promise<ReminderResult> {
  const conn = await getMongoConnection('live');
  const { Reservation, Restaurant } = getModels(conn);

  const restaurants = await Restaurant.find(
    {
      liveAt: { $ne: null },
      'reservationSettings.enabled': true,
      'reservationSettings.reminderHours': { $gt: 0 },
    },
    { name: 1, email: 1, locale: 1, timezone: 1, reservationSettings: 1 },
  )
    .lean<ReminderRestaurant[]>()
    .exec();

  let scanned = 0;
  let sent = 0;
  let failed = 0;

  for (const restaurant of restaurants) {
    if (sent >= batchSize) break;

    const settings = restaurant.reservationSettings;
    if (!settings?.enabled || settings.reminderHours <= 0) continue;

    const timezone =
      restaurant.timezone && restaurant.timezone.length > 0
        ? restaurant.timezone
        : DEFAULT_TIMEZONE;
    const locale =
      restaurant.locale && restaurant.locale.length > 0 ? restaurant.locale : DEFAULT_LOCALE;
    const cutoff = new Date(now.getTime() + settings.reminderHours * 60 * 60 * 1000);
    const startDateKey = dateKeyInTimezone(timezone, now);
    const endDateKey = dateKeyInTimezone(timezone, cutoff);
    const startTimeKey = timeKeyInTimezone(now, timezone);
    const endTimeKey = timeKeyInTimezone(cutoff, timezone);
    const remaining = batchSize - sent;
    const slotWindow =
      startDateKey === endDateKey
        ? [{ date: startDateKey, slotStart: { $gt: startTimeKey, $lte: endTimeKey } }]
        : [
            { date: startDateKey, slotStart: { $gt: startTimeKey } },
            { date: { $gt: startDateKey, $lt: endDateKey } },
            { date: endDateKey, slotStart: { $lte: endTimeKey } },
          ];

    const reservations = await Reservation.find({
      restaurantId: restaurant._id,
      status: 'confirmed',
      reminderSentAt: { $exists: false },
      $or: slotWindow,
    })
      .sort({ date: 1, slotStart: 1 })
      .limit(remaining)
      .lean<ReminderReservation[]>()
      .exec();

    scanned += reservations.length;

    for (const reservation of reservations) {
      const startsAt = localDateTimeInTimezoneToUtc(
        reservation.date,
        reservation.slotStart,
        timezone,
      );
      const endsAt = localDateTimeInTimezoneToUtc(reservation.date, reservation.slotEnd, timezone);
      if (!startsAt || startsAt <= now || startsAt > cutoff) continue;

      try {
        await sendTransactionalEmail({
          to: reservation.email,
          subject: `Reservation reminder · ${restaurant.name}`,
          replyTo: restaurant.email,
          react: ReservationReminderEmail({
            restaurantName: restaurant.name,
            customerName: reservation.name,
            dateLabel: formatDateLabel(startsAt, timezone, locale),
            slotLabel: endsAt
              ? `${formatTimeLabel(startsAt, timezone, locale)} - ${formatTimeLabel(endsAt, timezone, locale)}`
              : formatTimeLabel(startsAt, timezone, locale),
            partySize: reservation.partySize,
          }),
        });

        await Reservation.updateOne(
          {
            _id: reservation._id,
            restaurantId: restaurant._id,
            reminderSentAt: { $exists: false },
          },
          { $set: { reminderSentAt: new Date() } },
        ).exec();
        sent += 1;
      } catch (error) {
        failed += 1;
        captureException(error, {
          surface: 'worker:reservations',
          message: 'reservation reminder failed',
          restaurantId: restaurant._id.toString(),
          reservationId: reservation._id.toString(),
          error: errorMessage(error),
        });
      }
    }
  }

  return { restaurants: restaurants.length, scanned, sent, failed };
}
