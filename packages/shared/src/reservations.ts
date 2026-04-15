/**
 * Reservation slot computation. Pure helpers — given operating hours and
 * existing bookings, return the bookable time slots for a date.
 *
 * The model treats each restaurant day as a flat list of `(slotStart, slotEnd)`
 * windows in the local timezone. The dashboard shows what's left, the
 * storefront shows what the customer can pick.
 */

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
  /** True when at least one booking exists at this slot. */
  hasBookings: boolean;
}

const DAY_KEYS: RestaurantHourEntry['day'][] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseHHmm(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

function formatHHmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Return the local-timezone weekday for an ISO date string (YYYY-MM-DD).
 * UTC-safe: builds a noon UTC date so DST doesn't slide the day.
 */
export function isoWeekdayKey(isoDate: string): RestaurantHourEntry['day'] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const [, y, mo, d] = match;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
  return DAY_KEYS[dt.getUTCDay()] ?? null;
}

/**
 * Compute the bookable slot list for a date given operating hours,
 * reservation settings, and any existing bookings on that date.
 *
 * Returns the empty array when the date is closed, blocked, or reservations
 * are disabled.
 */
export function computeAvailableSlots(input: {
  date: string;
  hours: RestaurantHourEntry[];
  settings: ReservationSettings;
  bookings: BookedSlot[];
}): SlotOption[] {
  const { date, hours, settings, bookings } = input;
  if (!settings.enabled) return [];
  if (settings.blockedDates.includes(date)) return [];

  const weekday = isoWeekdayKey(date);
  if (!weekday) return [];
  const dayHours = hours.find((h) => h.day === weekday);
  if (!dayHours || dayHours.closed || !dayHours.open || !dayHours.close) return [];

  const openMinutes = parseHHmm(dayHours.open);
  const closeMinutes = parseHHmm(dayHours.close);
  if (closeMinutes <= openMinutes) return [];

  const stepMinutes = Math.max(15, settings.slotMinutes);
  const bookingsForDate = bookings.filter((b) => b.date === date);
  const slots: SlotOption[] = [];
  for (let cursor = openMinutes; cursor + stepMinutes <= closeMinutes; cursor += stepMinutes) {
    const slotStart = formatHHmm(cursor);
    const slotEnd = formatHHmm(cursor + stepMinutes);
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
