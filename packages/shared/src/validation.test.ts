import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getZodErrorMessage } from './validation';

describe('getZodErrorMessage', () => {
  it('formats the first issue path and message', () => {
    const schema = z.object({
      customer: z.object({
        email: z.string().email(),
      }),
    });

    const parsed = schema.safeParse({ customer: { email: 'not-an-email' } });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(getZodErrorMessage(parsed.error)).toBe('customer.email: Invalid email address');
  });

  it('falls back when the issue list is empty', () => {
    const error = new z.ZodError([]);
    expect(getZodErrorMessage(error, 'Bad request.')).toBe('Bad request.');
  });
});
