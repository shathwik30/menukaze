import type { Flag } from '@menukaze/rbac';
import { getZodErrorMessage } from '@menukaze/shared/validation';
import { PermissionDeniedError, requireAnyFlag, requireFlags } from '@/lib/session';
import type { RestaurantSessionContext } from '@/lib/session';
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

export function actionError(
  error: unknown,
  fallback: string,
  permissionMessage = 'You do not have permission to do that.',
): ActionFailure {
  if (error instanceof PermissionDeniedError) {
    return { ok: false, error: permissionMessage };
  }

  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

interface RestaurantActionContext {
  role: string;
  restaurantId: RestaurantSessionContext['restaurantId'];
  session: RestaurantSessionContext['session'];
}

async function withResolvedRestaurantAction<T>(
  accessPromise: Promise<RestaurantSessionContext & { role: string }>,
  handler: (context: RestaurantActionContext) => Promise<T>,
): Promise<T> {
  return handler(await accessPromise);
}

export async function withRestaurantAction<T>(
  flags: Flag[],
  handler: (context: RestaurantActionContext) => Promise<T>,
): Promise<T> {
  return withResolvedRestaurantAction(requireFlags(flags), handler);
}

export async function withRestaurantAnyFlagAction<T>(
  flags: Flag[],
  handler: (context: RestaurantActionContext) => Promise<T>,
): Promise<T> {
  return withResolvedRestaurantAction(requireAnyFlag(flags), handler);
}
