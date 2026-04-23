import type { Connection, Types } from 'mongoose';
import { startOfTodayInTimezone } from '@menukaze/shared';
import { getModels } from './models/index';

function todayKeyInTimezone(timezone: string | undefined | null, now: Date = new Date()): string {
  const start = startOfTodayInTimezone(timezone, now);
  // Render the date in the same timezone so the key matches the local day.
  const zone = timezone && timezone.length > 0 ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(start);
  const g = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/**
 * Atomically reserve the next sequential order pickup number for a restaurant
 * on the current local day. The counter resets at local midnight automatically
 * because each day writes to a new key.
 *
 * Uses `findOneAndUpdate` with `upsert: true` so it's safe under concurrent
 * writes; MongoDB guarantees atomicity on the `{ restaurantId, key }` unique
 * index.
 */
export async function reserveDailyPickupNumber(
  connection: Connection,
  restaurantId: Types.ObjectId,
  timezone: string | undefined | null,
): Promise<number> {
  const { Counter } = getModels(connection);
  const key = `order-pickup:${todayKeyInTimezone(timezone)}`;
  const doc = await Counter.findOneAndUpdate(
    { restaurantId, key },
    { $inc: { seq: 1 }, $setOnInsert: { restaurantId, key } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .setOptions({ skipTenantGuard: true })
    .exec();
  return doc?.seq ?? 1;
}
