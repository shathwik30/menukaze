import { headers } from 'next/headers';
import {
  type ActionFailure,
  type ActionResult,
  invalidEntityError,
  ipFromHeaders,
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

export async function withSuperAdminAction<T>(
  handler: (ctx: SuperAdminActionContext) => Promise<T>,
): Promise<T> {
  const session = await requireSuperAdmin();
  const h = await headers();
  const ip = ipFromHeaders(h) ?? 'unknown';
  const userAgent = h.get('user-agent') ?? '';
  return handler({ session, ip, userAgent });
}
