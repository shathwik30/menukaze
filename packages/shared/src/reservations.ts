export interface RestaurantHourEntry {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  closed: boolean;
  open?: string;
  close?: string;
}

export interface ReservationSettings {
  enabled: boolean;
  slotMinutes: number;
  maxPartySize: number;
  bufferMinutes: number;
  autoConfirm: boolean;
  reminderHours: number;
  blockedDates: string[];
}

export interface BookedSlot {
  date: string;
  slotStart: string;
  slotEnd: string;
  partySize: number;
  status: string;
}

export interface SlotOption {
  slotStart: string;
  slotEnd: string;
  hasBookings: boolean;
}

export const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'seated', 'completed'] as const;

const DAY_KEYS: RestaurantHourEntry['day'][] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseHHmm(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatHHmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function localDateAndMinutes(
  timeZone: string | undefined,
  now: Date,
): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone && timeZone.length > 0 ? timeZone : 'UTC',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: hour * 60 + minute,
    };
  } catch {
    return null;
  }
}

export function isoWeekdayKey(isoDate: string): RestaurantHourEntry['day'] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [, y, mo, d] = match;
  // Anchor at UTC noon so DST shifts never move the day.
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
  return DAY_KEYS[dt.getUTCDay()] ?? null;
}

export function computeAvailableSlots(input: {
  date: string;
  hours: RestaurantHourEntry[];
  settings: ReservationSettings;
  bookings: BookedSlot[];
  timeZone?: string;
  now?: Date;
}): SlotOption[] {
  const { date, hours, settings, bookings, timeZone, now } = input;
  if (!settings.enabled) return [];
  if (settings.blockedDates.includes(date)) return [];

  const localNow = now ? localDateAndMinutes(timeZone, now) : null;
  if (localNow) {
    if (date < localNow.date) return [];
  }

  const weekday = isoWeekdayKey(date);
  if (!weekday) return [];
  const dayHours = hours.find((h) => h.day === weekday);
  if (!dayHours || dayHours.closed || !dayHours.open || !dayHours.close) return [];

  const openMinutes = parseHHmm(dayHours.open);
  const closeMinutes = parseHHmm(dayHours.close);
  if (openMinutes === null || closeMinutes === null) return [];
  if (closeMinutes <= openMinutes) return [];

  const slotMinutes = Math.max(15, settings.slotMinutes);
  const stepMinutes = slotMinutes + Math.max(0, settings.bufferMinutes);
  const bookingsForDate = bookings.filter((b) => b.date === date);
  const slots: SlotOption[] = [];
  for (let cursor = openMinutes; cursor + slotMinutes <= closeMinutes; cursor += stepMinutes) {
    if (localNow && date === localNow.date && cursor <= localNow.minutes) continue;
    const slotStart = formatHHmm(cursor);
    const slotEnd = formatHHmm(cursor + slotMinutes);
    const hasBookings = bookingsForDate.some(
      (b) => b.slotStart === slotStart && b.status !== 'cancelled' && b.status !== 'no_show',
    );
    slots.push({ slotStart, slotEnd, hasBookings });
  }
  return slots;
}

export interface RestaurantOpenStatus {
  isOpen: boolean;
  /** Human-readable time the restaurant opens today (e.g. "9:00 AM"), only when closed. */
  opensAt?: string;
  /** Human-readable closing time (e.g. "10:00 PM"), only when currently open. */
  closesAt?: string;
}

function formatTime12h(hhMm: string): string {
  const [hStr, mStr] = hhMm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Returns whether the restaurant is currently open based on its operating hours
 * schedule and timezone. When no hours are configured, it returns open=true so
 * the absence of a schedule never blocks ordering.
 */
export function getRestaurantOpenStatus(
  hours: RestaurantHourEntry[],
  timezone: string | null | undefined,
  now: Date = new Date(),
): RestaurantOpenStatus {
  if (!hours || hours.length === 0) return { isOpen: true };

  const zone = timezone?.trim() ?? 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase();
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);

  const dayKey = weekdayShort as RestaurantHourEntry['day'] | undefined;
  if (!dayKey) return { isOpen: true };

  const dayEntry = hours.find((h) => h.day === dayKey);
  if (!dayEntry) return { isOpen: true };
  if (dayEntry.closed) return { isOpen: false };
  if (!dayEntry.open || !dayEntry.close) return { isOpen: true };

  const currentMinutes = hour * 60 + minute;
  const openMinutes = parseHHmm(dayEntry.open);
  const closeMinutes = parseHHmm(dayEntry.close);
  if (openMinutes === null || closeMinutes === null) return { isOpen: true };

  if (currentMinutes < openMinutes) {
    return { isOpen: false, opensAt: formatTime12h(dayEntry.open) };
  }
  if (currentMinutes >= closeMinutes) {
    return { isOpen: false };
  }
  return { isOpen: true, closesAt: formatTime12h(dayEntry.close) };
}

export function isReservationSlotValid(input: {
  date: string;
  slotStart: string;
  slotEnd: string;
  hours: RestaurantHourEntry[];
  settings: ReservationSettings;
  timeZone?: string;
  now?: Date;
}): { ok: true } | { ok: false; error: string } {
  const slots = computeAvailableSlots({
    ...input,
    bookings: [],
  });
  if (slots.length === 0) {
    return { ok: false, error: 'Reservations are not available on that date.' };
  }
  if (!slots.some((s) => s.slotStart === input.slotStart && s.slotEnd === input.slotEnd)) {
    return { ok: false, error: 'Pick one of the listed time slots.' };
  }
  return { ok: true };
}
