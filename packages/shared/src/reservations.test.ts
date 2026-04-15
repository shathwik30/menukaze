import { describe, expect, it } from 'vitest';
import {
  computeAvailableSlots,
  isReservationSlotValid,
  isoWeekdayKey,
  type ReservationSettings,
} from './reservations';

const baseSettings: ReservationSettings = {
  enabled: true,
  slotMinutes: 60,
  maxPartySize: 8,
  bufferMinutes: 0,
  autoConfirm: true,
  reminderHours: 24,
  blockedDates: [],
};

const hours = [
  { day: 'mon' as const, closed: false, open: '12:00', close: '15:00' },
  { day: 'tue' as const, closed: false, open: '12:00', close: '15:00' },
  { day: 'wed' as const, closed: true },
  { day: 'thu' as const, closed: false, open: '12:00', close: '15:00' },
  { day: 'fri' as const, closed: false, open: '12:00', close: '15:00' },
  { day: 'sat' as const, closed: false, open: '12:00', close: '15:00' },
  { day: 'sun' as const, closed: false, open: '12:00', close: '15:00' },
];

describe('isoWeekdayKey', () => {
  it('returns the weekday key for a valid date', () => {
    // 2026-04-13 is a Monday
    expect(isoWeekdayKey('2026-04-13')).toBe('mon');
  });

  it('returns null for an invalid date string', () => {
    expect(isoWeekdayKey('not-a-date')).toBeNull();
  });
});

describe('computeAvailableSlots', () => {
  it('returns slots between open and close', () => {
    const slots = computeAvailableSlots({
      date: '2026-04-13',
      hours,
      settings: baseSettings,
      bookings: [],
    });
    expect(slots.map((s) => s.slotStart)).toEqual(['12:00', '13:00', '14:00']);
  });

  it('returns empty when reservations are disabled', () => {
    const slots = computeAvailableSlots({
      date: '2026-04-13',
      hours,
      settings: { ...baseSettings, enabled: false },
      bookings: [],
    });
    expect(slots).toEqual([]);
  });

  it('returns empty on a closed day', () => {
    expect(
      computeAvailableSlots({
        date: '2026-04-15',
        hours,
        settings: baseSettings,
        bookings: [],
      }),
    ).toEqual([]);
  });

  it('returns empty when the date is in the blocked list', () => {
    expect(
      computeAvailableSlots({
        date: '2026-04-13',
        hours,
        settings: { ...baseSettings, blockedDates: ['2026-04-13'] },
        bookings: [],
      }),
    ).toEqual([]);
  });

  it('flags slots that already have a booking', () => {
    const slots = computeAvailableSlots({
      date: '2026-04-13',
      hours,
      settings: baseSettings,
      bookings: [
        {
          date: '2026-04-13',
          slotStart: '13:00',
          slotEnd: '14:00',
          partySize: 2,
          status: 'confirmed',
        },
      ],
    });
    expect(slots.find((s) => s.slotStart === '13:00')?.hasBookings).toBe(true);
    expect(slots.find((s) => s.slotStart === '12:00')?.hasBookings).toBe(false);
  });

  it('ignores cancelled bookings when flagging', () => {
    const slots = computeAvailableSlots({
      date: '2026-04-13',
      hours,
      settings: baseSettings,
      bookings: [
        {
          date: '2026-04-13',
          slotStart: '13:00',
          slotEnd: '14:00',
          partySize: 2,
          status: 'cancelled',
        },
      ],
    });
    expect(slots.find((s) => s.slotStart === '13:00')?.hasBookings).toBe(false);
  });
});

describe('isReservationSlotValid', () => {
  it('passes when slot matches a generated option', () => {
    expect(
      isReservationSlotValid({
        date: '2026-04-13',
        slotStart: '13:00',
        slotEnd: '14:00',
        hours,
        settings: baseSettings,
      }).ok,
    ).toBe(true);
  });

  it('fails for a slot outside operating hours', () => {
    const result = isReservationSlotValid({
      date: '2026-04-13',
      slotStart: '20:00',
      slotEnd: '21:00',
      hours,
      settings: baseSettings,
    });
    expect(result.ok).toBe(false);
  });
});
