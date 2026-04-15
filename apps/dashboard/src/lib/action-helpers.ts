import type { Flag } from '@menukaze/rbac';
import {
  type ActionFailure,
  type ActionResult,
  invalidEntityError,
  validationError,
} from '@menukaze/shared';
import { PermissionDeniedError, requireAnyFlag, requireFlags } from '@/lib/session';
import type { RestaurantSessionContext } from '@/lib/session';

export { type ActionFailure, type ActionResult, invalidEntityError, validationError };

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
