const MIN_TIMEOUT_MINUTES = 30;
const MAX_TIMEOUT_MINUTES = 12 * 60;

export const DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES = 180;
export const SESSION_TIMEOUT_WARNING_MINUTES = 15;

function coerceDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function normalizeDineInSessionTimeoutMinutes(value?: number | null): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES;
  }
  return Math.min(MAX_TIMEOUT_MINUTES, Math.max(MIN_TIMEOUT_MINUTES, Math.trunc(value!)));
}

export function getSessionTimeoutAt(
  lastActivityAt: Date | string,
  timeoutMinutes?: number | null,
): Date {
  const base = coerceDate(lastActivityAt);
  return new Date(base.getTime() + normalizeDineInSessionTimeoutMinutes(timeoutMinutes) * 60_000);
}

export function getSessionWarningAt(
  lastActivityAt: Date | string,
  timeoutMinutes?: number | null,
): Date {
  return new Date(
    getSessionTimeoutAt(lastActivityAt, timeoutMinutes).getTime() -
      SESSION_TIMEOUT_WARNING_MINUTES * 60_000,
  );
}

export function getSessionMsRemaining(
  lastActivityAt: Date | string,
  timeoutMinutes?: number | null,
  now: Date | string = new Date(),
): number {
  return getSessionTimeoutAt(lastActivityAt, timeoutMinutes).getTime() - coerceDate(now).getTime();
}

export function isSessionExpired(
  lastActivityAt: Date | string,
  timeoutMinutes?: number | null,
  now: Date | string = new Date(),
): boolean {
  return getSessionMsRemaining(lastActivityAt, timeoutMinutes, now) <= 0;
}

export function isSessionInWarningWindow(
  lastActivityAt: Date | string,
  timeoutMinutes?: number | null,
  now: Date | string = new Date(),
): boolean {
  const remaining = getSessionMsRemaining(lastActivityAt, timeoutMinutes, now);
  return remaining > 0 && remaining <= SESSION_TIMEOUT_WARNING_MINUTES * 60_000;
}

export function getSessionMinutesRemaining(
  lastActivityAt: Date | string,
  timeoutMinutes?: number | null,
  now: Date | string = new Date(),
): number {
  return Math.max(
    0,
    Math.ceil(getSessionMsRemaining(lastActivityAt, timeoutMinutes, now) / 60_000),
  );
}
