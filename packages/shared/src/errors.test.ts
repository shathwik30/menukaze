import { describe, expect, it } from 'vitest';
import { APIError, ERROR_CODES, isAPIError } from './errors';

describe('APIError', () => {
  it('uses the registry default message when none is supplied', () => {
    const err = new APIError('not_found');
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
    expect(err.message).toBe(ERROR_CODES.not_found.message);
  });

  it('overrides the message when supplied', () => {
    const err = new APIError('forbidden', { message: 'Custom forbidden message' });
    expect(err.message).toBe('Custom forbidden message');
    expect(err.status).toBe(403);
  });

  it('builds an envelope including details when present', () => {
    const err = new APIError('validation_failed', { details: { field: 'email' } });
    expect(err.toEnvelope()).toEqual({
      error: {
        code: 'validation_failed',
        message: ERROR_CODES.validation_failed.message,
        status: 422,
        details: { field: 'email' },
      },
    });
  });

  it('omits details from the envelope when not provided', () => {
    const err = new APIError('rate_limit_exceeded');
    expect(err.toEnvelope()).toEqual({
      error: {
        code: 'rate_limit_exceeded',
        message: ERROR_CODES.rate_limit_exceeded.message,
        status: 429,
      },
    });
  });

  it('preserves the cause for debugging', () => {
    const cause = new Error('underlying');
    const err = new APIError('internal_error', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('isAPIError', () => {
  it('detects APIError instances', () => {
    expect(isAPIError(new APIError('not_found'))).toBe(true);
  });

  it('rejects plain Errors', () => {
    expect(isAPIError(new Error('boom'))).toBe(false);
  });

  it('rejects unrelated values', () => {
    expect(isAPIError(null)).toBe(false);
    expect(isAPIError({ code: 'not_found' })).toBe(false);
    expect(isAPIError('string')).toBe(false);
  });
});

describe('ERROR_CODES registry', () => {
  it('maps every code to a numeric HTTP status', () => {
    for (const [code, def] of Object.entries(ERROR_CODES)) {
      expect(def.status, `code=${code}`).toBeGreaterThanOrEqual(400);
      expect(def.status, `code=${code}`).toBeLessThan(600);
      expect(def.message.length, `code=${code}`).toBeGreaterThan(0);
    }
  });
});
