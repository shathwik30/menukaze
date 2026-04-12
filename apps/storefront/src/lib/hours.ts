import type { RestaurantDoc } from '@menukaze/db';

type DayKey = RestaurantDoc['hours'][number]['day'];
type RestaurantHours = Pick<RestaurantDoc, 'hours' | 'timezone'>;
const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export type OpenStatus = { open: true; closesAt: string } | { open: false; nextOpenLabel?: string };

function getLocalParts(timezone: string, at: Date): { day: DayKey; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const weekday = parts.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? 'mon';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayMap: Record<string, DayKey> = {
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
    sun: 'sun',
  };
  return {
    day: dayMap[weekday] ?? 'mon',
    hhmm: `${hour === '24' ? '00' : hour}:${minute}`,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isInWindow(now: string, open: string, close: string): boolean {
  return cmp(open, now) <= 0 && cmp(now, close) < 0;
}

export function computeOpenStatus(restaurant: RestaurantHours, at = new Date()): OpenStatus {
  const hours = restaurant.hours ?? [];
  if (hours.length === 0) return { open: false };

  const { day, hhmm } = getLocalParts(restaurant.timezone, at);
  const today = hours.find((h) => h.day === day);

  if (today && !today.closed && today.open && today.close) {
    const inBreak = today.breaks.some((b) => isInWindow(hhmm, b.start, b.end));
    if (!inBreak && isInWindow(hhmm, today.open, today.close)) {
      return { open: true, closesAt: today.close };
    }
  }

  for (let offset = 0; offset < 7; offset += 1) {
    const dayIdx = DAY_ORDER.indexOf(day);
    const nextIdx = (dayIdx + offset) % 7;
    const nextDay = DAY_ORDER[nextIdx]!;
    const entry = hours.find((h) => h.day === nextDay);
    if (entry && !entry.closed && entry.open) {
      if (offset === 0 && cmp(hhmm, entry.open) < 0) {
        return { open: false, nextOpenLabel: `Opens at ${entry.open}` };
      }
      if (offset > 0) {
        return { open: false, nextOpenLabel: `Opens ${DAY_LABEL[nextDay]} at ${entry.open}` };
      }
    }
  }

  return { open: false };
}

export function formatTodayHours(restaurant: RestaurantHours, at = new Date()): string {
  const { day } = getLocalParts(restaurant.timezone, at);
  const today = restaurant.hours.find((h) => h.day === day);
  if (!today || today.closed || !today.open || !today.close) return 'Closed today';
  return `${today.open} – ${today.close}`;
}
