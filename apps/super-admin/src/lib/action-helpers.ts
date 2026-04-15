import { headers } from 'next/headers';
import {
  type ActionFailure,
  type ActionResult,
  invalidEntityError,
  validationError,
} from '@menukaze/shared';
import { requireSuperAdmin, type SuperAdminSession } from '@/lib/session';

export { type ActionFailure, type ActionResult, invalidEntityError, validationError };

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
