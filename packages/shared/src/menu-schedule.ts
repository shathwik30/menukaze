export type MenuScheduleDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface MenuSchedule {
  days: MenuScheduleDay[];
  startTime: string;
  endTime: string;
}

const DAY_TO_INDEX: Record<MenuScheduleDay, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const INDEX_TO_DAY: MenuScheduleDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function isMenuScheduleDay(value: string): value is MenuScheduleDay {
  return value in DAY_TO_INDEX;
}

function getZonedDateParts(
  date: Date,
  timeZone: string,
): { day: MenuScheduleDay; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase() ?? 'sun';
  const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10);
  const weekdayKey = weekday.slice(0, 3);
  const day = isMenuScheduleDay(weekdayKey) ? weekdayKey : 'sun';

  return {
    day: INDEX_TO_DAY[DAY_TO_INDEX[day]] ?? 'sun',
    minutes: hour * 60 + minute,
  };
}

function previousDay(day: MenuScheduleDay): MenuScheduleDay {
  return INDEX_TO_DAY[(DAY_TO_INDEX[day] + 6) % 7] ?? 'sun';
}

export function isMenuScheduleActive(
  schedule: MenuSchedule | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!schedule) return true;
  if (schedule.days.length === 0) return true;

  const { day, minutes } = getZonedDateParts(now, timeZone);
  const start = parseMinutes(schedule.startTime);
  const end = parseMinutes(schedule.endTime);
  if (start === null || end === null) return false;

  if (start === end) {
    return schedule.days.includes(day);
  }

  if (start < end) {
    return schedule.days.includes(day) && minutes >= start && minutes < end;
  }

  if (minutes >= start) {
    return schedule.days.includes(day);
  }

  return minutes < end && schedule.days.includes(previousDay(day));
}

export function filterActiveMenus<T extends { schedule?: MenuSchedule | null }>(
  menus: readonly T[],
  timeZone: string,
  now: Date = new Date(),
): T[] {
  return menus.filter((menu) => isMenuScheduleActive(menu.schedule, timeZone, now));
}
