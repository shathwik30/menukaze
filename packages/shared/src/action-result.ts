import type { ZodError } from 'zod';
import { getZodErrorMessage } from './validation';

/**
 * Shared discriminated union for Next.js Server Action results.
 *
 * Every action in the monorepo returns `ActionResult<T>`. Client components
 * narrow with `result.ok` before reading `result.data`.
 *
 * The union is asymmetric so callers returning `void`-ish data can return
 * `{ ok: true }` without a `data` field.
 */

export interface ActionFailure {
  ok: false;
  error: string;
}

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | ActionFailure;

export function validationError(error: ZodError, fallback = 'Invalid input.'): ActionFailure {
  return { ok: false, error: getZodErrorMessage(error, fallback) };
}

export function invalidEntityError(entity: string): ActionFailure {
  return { ok: false, error: `Unknown ${entity}.` };
}
