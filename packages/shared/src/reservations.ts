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
