import { describe, expect, it } from 'vitest';
import { isMenuScheduleActive } from './menu-schedule';

describe('isMenuScheduleActive', () => {
  it('treats invalid schedule times as inactive instead of midnight', () => {
    expect(
      isMenuScheduleActive(
        { days: ['mon'], startTime: '99:99', endTime: '10:00' },
        'UTC',
        new Date('2026-05-25T09:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('supports overnight schedules in the restaurant timezone', () => {
    expect(
      isMenuScheduleActive(
        { days: ['mon'], startTime: '22:00', endTime: '02:00' },
        'UTC',
        new Date('2026-05-26T01:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
