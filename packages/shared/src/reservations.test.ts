import { describe, expect, it } from 'vitest';
import {
  computeAvailableSlots,
  isoWeekdayKey,
  isReservationSlotValid,
  type ReservationSettings,
  type RestaurantHourEntry,
} from './reservations';

const hours: RestaurantHourEntry[] = [
  { day: 'mon', closed: false, open: '09:00', close: '12:00' },
  { day: 'tue', closed: false, open: '09:00', close: '21:00' },
  { day: 'wed', closed: false, open: '09:00', close: '21:00' },
  { day: 'thu', closed: false, open: '09:00', close: '21:00' },
  { day: 'fri', closed: false, open: '09:00', close: '21:00' },
  { day: 'sat', closed: false, open: '09:00', close: '21:00' },
  { day: 'sun', closed: true },
];

const settings: ReservationSettings = {
  enabled: true,
  slotMinutes: 60,
  maxPartySize: 8,
  bufferMinutes: 0,
  autoConfirm: true,
  reminderHours: 24,
  blockedDates: [],
};

describe('isoWeekdayKey', () => {
  it('returns the correct weekday anchored at noon UTC', () => {
    // 2026-01-05 is a Monday
    expect(isoWeekdayKey('2026-01-05')).toBe('mon');
    expect(isoWeekdayKey('2026-01-11')).toBe('sun');
  });

  it('returns null for malformed input', () => {
    expect(isoWeekdayKey('2026-1-5')).toBeNull();
    expect(isoWeekdayKey('nope')).toBeNull();
  });
});

describe('computeAvailableSlots', () => {
  it('returns slots spanning open to close at the configured step', () => {
    const slots = computeAvailableSlots({
      date: '2026-01-06',
      hours,
      settings,
      bookings: [],
    });
    expect(slots.at(0)).toEqual({ slotStart: '09:00', slotEnd: '10:00', hasBookings: false });
    expect(slots.at(-1)).toEqual({ slotStart: '20:00', slotEnd: '21:00', hasBookings: false });
    expect(slots).toHaveLength(12);
  });

  it('returns an empty list when reservations are disabled', () => {
    expect(
      computeAvailableSlots({
        date: '2026-01-06',
        hours,
        settings: { ...settings, enabled: false },
        bookings: [],
      }),
    ).toEqual([]);
  });

  it('returns an empty list when the date is blocked', () => {
    expect(
      computeAvailableSlots({
        date: '2026-01-06',
        hours,
        settings: { ...settings, blockedDates: ['2026-01-06'] },
        bookings: [],
      }),
    ).toEqual([]);
  });

  it('returns an empty list when the day is closed', () => {
    expect(
      computeAvailableSlots({
        date: '2026-01-11',
        hours,
        settings,
        bookings: [],
      }),
    ).toEqual([]);
  });

  it('marks slots as hasBookings when an active booking exists', () => {
    const slots = computeAvailableSlots({
      date: '2026-01-06',
      hours,
      settings,
      bookings: [
        {
          date: '2026-01-06',
          slotStart: '12:00',
          slotEnd: '13:00',
          partySize: 2,
          status: 'confirmed',
        },
      ],
    });
    const noon = slots.find((s) => s.slotStart === '12:00');
    expect(noon?.hasBookings).toBe(true);
  });

  it('ignores bookings with status cancelled or no_show', () => {
    const slots = computeAvailableSlots({
      date: '2026-01-06',
      hours,
      settings,
      bookings: [
        {
          date: '2026-01-06',
          slotStart: '12:00',
          slotEnd: '13:00',
          partySize: 2,
          status: 'cancelled',
        },
      ],
    });
    expect(slots.find((s) => s.slotStart === '12:00')?.hasBookings).toBe(false);
  });
});

describe('isReservationSlotValid', () => {
  it('accepts an exact slot boundary', () => {
    expect(
      isReservationSlotValid({
        date: '2026-01-06',
        slotStart: '10:00',
        slotEnd: '11:00',
        hours,
        settings,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects slots that do not align to the step boundaries', () => {
    const result = isReservationSlotValid({
      date: '2026-01-06',
      slotStart: '10:15',
      slotEnd: '11:15',
      hours,
      settings,
    });
    expect(result.ok).toBe(false);
  });
});
