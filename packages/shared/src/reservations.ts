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
