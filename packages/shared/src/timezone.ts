/**
 * Returns the UTC `Date` corresponding to midnight of the current day in the
 * given IANA timezone. Used for "today"-style reports so orders are bucketed
 * by the restaurant's local day, not the server's UTC day.
 *
 * Falls back to UTC midnight for an unknown/empty zone.
 */
export function startOfTodayInTimezone(
  timezone: string | undefined | null,
  now: Date = new Date(),
): Date {
  const zone = timezone && timezone.length > 0 ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const find = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const year = find('year');
  const month = find('month');
  const day = find('day');
  // First, treat the local midnight as if it were UTC. This gives us a date
  // whose value is off by exactly the timezone's offset from UTC at that
  // instant. We then subtract the zone's offset so we land on the correct
  // UTC instant that represents local midnight.
  const asIfUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  const zoneOffsetMinutes = tzOffsetMinutes(zone, new Date(asIfUtc));
  return new Date(asIfUtc - zoneOffsetMinutes * 60_000);
}

/**
 * Minutes that `zone` is offset from UTC at `at` (east = positive).
 * Implemented without third-party tz libraries by comparing the same instant
 * formatted in UTC vs the target zone.
 */
function tzOffsetMinutes(zone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const p = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((x) => x.type === t)?.value ?? 0);
  const asZoneUtc = Date.UTC(
    p('year'),
    p('month') - 1,
    p('day'),
    p('hour'),
    p('minute'),
    p('second'),
  );
  return Math.round((asZoneUtc - at.getTime()) / 60_000);
}
