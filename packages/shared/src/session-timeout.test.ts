import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES,
  getSessionMinutesRemaining,
  getSessionTimeoutAt,
  getSessionWarningAt,
  isSessionExpired,
  isSessionInWarningWindow,
  normalizeDineInSessionTimeoutMinutes,
} from './session-timeout';

describe('session timeout helpers', () => {
  const lastActivityAt = new Date('2026-04-12T10:00:00.000Z');

  it('defaults to three hours when unset', () => {
    expect(normalizeDineInSessionTimeoutMinutes(undefined)).toBe(
      DEFAULT_DINE_IN_SESSION_TIMEOUT_MINUTES,
    );
  });

  it('clamps unsafe values into the supported range', () => {
    expect(normalizeDineInSessionTimeoutMinutes(5)).toBe(30);
    expect(normalizeDineInSessionTimeoutMinutes(24 * 60)).toBe(12 * 60);
  });

  it('computes timeout and warning thresholds', () => {
    expect(getSessionTimeoutAt(lastActivityAt, 180).toISOString()).toBe('2026-04-12T13:00:00.000Z');
    expect(getSessionWarningAt(lastActivityAt, 180).toISOString()).toBe('2026-04-12T12:45:00.000Z');
  });

  it('detects the warning window before expiry', () => {
    expect(
      isSessionInWarningWindow(lastActivityAt, 180, new Date('2026-04-12T12:50:00.000Z')),
    ).toBe(true);
    expect(
      isSessionInWarningWindow(lastActivityAt, 180, new Date('2026-04-12T12:20:00.000Z')),
    ).toBe(false);
  });

  it('marks sessions expired when the clock passes the cutoff', () => {
    expect(isSessionExpired(lastActivityAt, 180, new Date('2026-04-12T13:00:01.000Z'))).toBe(true);
  });

  it('rounds minutes remaining up for customer-facing alerts', () => {
    expect(
      getSessionMinutesRemaining(lastActivityAt, 30, new Date('2026-04-12T10:00:01.000Z')),
    ).toBe(30);
  });
});
