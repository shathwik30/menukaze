import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES,
  SESSION_TIMEOUT_WARNING_MINUTES,
  getSessionMinutesRemaining,
  getSessionMsRemaining,
  getSessionTimeoutAt,
  getSessionWarningAt,
  isSessionExpired,
  isSessionInWarningWindow,
  normalizeDineInSessionTimeoutMinutes,
} from './session-timeout';

describe('normalizeDineInSessionTimeoutMinutes', () => {
  it('returns the default for null / undefined / non-finite values', () => {
    expect(normalizeDineInSessionTimeoutMinutes()).toBe(DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES);
    expect(normalizeDineInSessionTimeoutMinutes(null)).toBe(
      DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES,
    );
    expect(normalizeDineInSessionTimeoutMinutes(Number.NaN)).toBe(
      DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES,
    );
  });

  it('clamps values to [30, 720]', () => {
    expect(normalizeDineInSessionTimeoutMinutes(5)).toBe(30);
    expect(normalizeDineInSessionTimeoutMinutes(10_000)).toBe(720);
    expect(normalizeDineInSessionTimeoutMinutes(60)).toBe(60);
  });
});

describe('isSessionExpired / isSessionInWarningWindow', () => {
  const lastActivityAt = new Date('2026-01-01T10:00:00Z');

  it('returns false before the timeout elapses', () => {
    expect(isSessionExpired(lastActivityAt, 60, new Date('2026-01-01T10:30:00Z'))).toBe(false);
  });

  it('returns true once the timeout has elapsed', () => {
    expect(isSessionExpired(lastActivityAt, 60, new Date('2026-01-01T11:30:00Z'))).toBe(true);
  });

  it('flags the warning window only within the final SESSION_TIMEOUT_WARNING_MINUTES', () => {
    const timeoutAt = getSessionTimeoutAt(lastActivityAt, 60);
    const inWarning = new Date(
      timeoutAt.getTime() - (SESSION_TIMEOUT_WARNING_MINUTES - 2) * 60_000,
    );
    const beforeWarning = new Date(
      timeoutAt.getTime() - (SESSION_TIMEOUT_WARNING_MINUTES + 5) * 60_000,
    );
    expect(isSessionInWarningWindow(lastActivityAt, 60, inWarning)).toBe(true);
    expect(isSessionInWarningWindow(lastActivityAt, 60, beforeWarning)).toBe(false);
  });
});

describe('getSessionMsRemaining / getSessionMinutesRemaining / getSessionWarningAt', () => {
  const lastActivityAt = new Date('2026-01-01T10:00:00Z');

  it('ms remaining is positive before expiry and non-positive after', () => {
    expect(getSessionMsRemaining(lastActivityAt, 60, '2026-01-01T10:30:00Z')).toBeGreaterThan(0);
    expect(getSessionMsRemaining(lastActivityAt, 60, '2026-01-01T11:30:00Z')).toBeLessThanOrEqual(
      0,
    );
  });

  it('minutes remaining rounds up and floors at 0', () => {
    expect(getSessionMinutesRemaining(lastActivityAt, 60, '2026-01-01T10:30:30Z')).toBe(30);
    expect(getSessionMinutesRemaining(lastActivityAt, 60, '2026-01-02T10:30:30Z')).toBe(0);
  });

  it('warningAt sits SESSION_TIMEOUT_WARNING_MINUTES before the timeout', () => {
    const timeout = getSessionTimeoutAt(lastActivityAt, 60);
    const warning = getSessionWarningAt(lastActivityAt, 60);
    expect(timeout.getTime() - warning.getTime()).toBe(SESSION_TIMEOUT_WARNING_MINUTES * 60_000);
  });
});
