import type { ZodError } from 'zod';

export function getZodErrorMessage(error: ZodError, fallback = 'Invalid input.'): string {
  const firstIssue = error.issues[0];
  return firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : fallback;
}
