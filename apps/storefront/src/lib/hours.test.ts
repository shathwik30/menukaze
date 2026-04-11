import { describe, expect, it } from 'vitest';
import type { RestaurantDoc } from '@menukaze/db';
import { computeOpenStatus, formatTodayHours } from './hours';

/**
 * Unit tests for the storefront hours helper.
 *
 * Every fixture pins the restaurant timezone to UTC so the test outcome is
 * independent of the machine clock, and uses fixed `Date` objects (Monday
 * 2026-04-13 is the base day) so the day-of-week maths is deterministic.
 */

type Hours = RestaurantDoc['hours'];

function restaurant(hours: Hours): RestaurantDoc {
  return {
    timezone: 'UTC',
    hours,
  } as unknown as RestaurantDoc;
}

const mondayNoon = new Date('2026-04-13T12:00:00Z');
const mondayEarly = new Date('2026-04-13T08:00:00Z');
const mondayNight = new Date('2026-04-13T23:30:00Z');
const sundayNight = new Date('2026-04-12T23:00:00Z');

describe('computeOpenStatus', () => {
  it('returns { open: false } when no hours are configured', () => {
    const r = restaurant([]);
    expect(computeOpenStatus(r, mondayNoon)).toEqual({ open: false });
  });

  it('returns { open: true, closesAt } when inside today window', () => {
    const r = restaurant([
      { day: 'mon', closed: false, open: '09:00', close: '22:00', breaks: [] },
    ]);
    expect(computeOpenStatus(r, mondayNoon)).toEqual({
      open: true,
      closesAt: '22:00',
    });
  });

  it('returns "Opens at HH:MM" when today but before opening', () => {
    const r = restaurant([
      { day: 'mon', closed: false, open: '10:00', close: '22:00', breaks: [] },
    ]);
    expect(computeOpenStatus(r, mondayEarly)).toEqual({
      open: false,
      nextOpenLabel: 'Opens at 10:00',
    });
  });

  it('returns next day label when today is past closing', () => {
    const r = restaurant([
      { day: 'mon', closed: false, open: '09:00', close: '22:00', breaks: [] },
      { day: 'tue', closed: false, open: '09:00', close: '22:00', breaks: [] },
    ]);
    expect(computeOpenStatus(r, mondayNight)).toEqual({
      open: false,
      nextOpenLabel: 'Opens Tuesday at 09:00',
    });
  });

  it('skips closed days when computing the next open label', () => {
    // Sunday night, with Monday marked closed — next open is Tuesday.
    const r = restaurant([
      { day: 'sun', closed: false, open: '10:00', close: '22:00', breaks: [] },
      { day: 'mon', closed: true, breaks: [] },
      { day: 'tue', closed: false, open: '11:00', close: '22:00', breaks: [] },
    ]);
    expect(computeOpenStatus(r, sundayNight)).toEqual({
      open: false,
      nextOpenLabel: 'Opens Tuesday at 11:00',
    });
  });

  it('is closed during a configured break window', () => {
    const r = restaurant([
      {
        day: 'mon',
        closed: false,
        open: '09:00',
        close: '22:00',
        breaks: [{ start: '11:30', end: '12:30' }],
      },
    ]);
    // mondayNoon = 12:00 — inside the break.
    expect(computeOpenStatus(r, mondayNoon)).toEqual({ open: false });
  });

  it('returns { open: false } on an explicitly closed day with no other hours', () => {
    const r = restaurant([{ day: 'mon', closed: true, breaks: [] }]);
    expect(computeOpenStatus(r, mondayNoon)).toEqual({ open: false });
  });
});

describe('formatTodayHours', () => {
  it('returns "HH:MM – HH:MM" for an open day', () => {
    const r = restaurant([
      { day: 'mon', closed: false, open: '09:00', close: '22:00', breaks: [] },
    ]);
    expect(formatTodayHours(r, mondayNoon)).toBe('09:00 – 22:00');
  });

  it('returns "Closed today" for a closed day', () => {
    const r = restaurant([{ day: 'mon', closed: true, breaks: [] }]);
    expect(formatTodayHours(r, mondayNoon)).toBe('Closed today');
  });

  it('returns "Closed today" when no entry exists for the current day', () => {
    const r = restaurant([
      { day: 'tue', closed: false, open: '09:00', close: '22:00', breaks: [] },
    ]);
    expect(formatTodayHours(r, mondayNoon)).toBe('Closed today');
  });
});
