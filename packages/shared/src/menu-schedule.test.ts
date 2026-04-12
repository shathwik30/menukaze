import { describe, expect, it } from 'vitest';
import { filterActiveMenus, isMenuScheduleActive } from './menu-schedule';

describe('isMenuScheduleActive', () => {
  it('treats unscheduled menus as always active', () => {
    expect(isMenuScheduleActive(undefined, 'Asia/Kolkata')).toBe(true);
  });

  it('treats empty-days schedule as always active', () => {
    expect(isMenuScheduleActive({ days: [], startTime: '', endTime: '' }, 'Asia/Kolkata')).toBe(
      true,
    );
  });

  it('matches same-day schedules in the restaurant timezone', () => {
    expect(
      isMenuScheduleActive(
        { days: ['mon'], startTime: '09:00', endTime: '15:00' },
        'Asia/Kolkata',
        new Date('2026-04-13T06:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isMenuScheduleActive(
        { days: ['mon'], startTime: '09:00', endTime: '15:00' },
        'Asia/Kolkata',
        new Date('2026-04-13T11:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('supports overnight windows', () => {
    expect(
      isMenuScheduleActive(
        { days: ['fri'], startTime: '18:00', endTime: '02:00' },
        'Asia/Kolkata',
        new Date('2026-04-10T16:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isMenuScheduleActive(
        { days: ['fri'], startTime: '18:00', endTime: '02:00' },
        'Asia/Kolkata',
        new Date('2026-04-10T22:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('filterActiveMenus', () => {
  it('keeps only active menus', () => {
    const active = filterActiveMenus(
      [
        { id: 'all-day' },
        { id: 'lunch', schedule: { days: ['mon'], startTime: '11:00', endTime: '15:00' } },
        { id: 'dinner', schedule: { days: ['mon'], startTime: '18:00', endTime: '22:00' } },
      ],
      'Asia/Kolkata',
      new Date('2026-04-13T07:00:00.000Z'),
    );

    expect(active.map((menu) => menu.id)).toEqual(['all-day', 'lunch']);
  });
});
