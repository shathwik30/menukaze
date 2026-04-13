import { headers } from 'next/headers';
import { getZodErrorMessage } from '@menukaze/shared/validation';
import { requireSuperAdmin, type SuperAdminSession } from '@/lib/session';
import type { ZodError } from 'zod';

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

export function actionError(error: unknown, fallback: string): ActionFailure {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export interface SuperAdminActionContext {
  session: SuperAdminSession;
  ip: string;
  userAgent: string;
}

/**
 * Wraps a server action with super-admin authentication. Extracts the caller's
 * IP and user-agent for audit logging.
 */
export async function withSuperAdminAction<T>(
  handler: (ctx: SuperAdminActionContext) => Promise<T>,
): Promise<T> {
  const session = await requireSuperAdmin();
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  const userAgent = h.get('user-agent') ?? '';
  return handler({ session, ip, userAgent });
}
