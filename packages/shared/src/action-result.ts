import type { ZodError } from 'zod';
import { getZodErrorMessage } from './validation';

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
