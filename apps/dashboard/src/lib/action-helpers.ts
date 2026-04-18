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

interface ActionMessages {
  onError: string;
  onForbidden?: string;
}

async function runAction<R extends { ok: boolean }>(
  accessPromise: Promise<RestaurantSessionContext & { role: string }>,
  messages: ActionMessages,
  handler: (context: RestaurantActionContext) => Promise<R>,
): Promise<R | ActionFailure> {
  try {
    return await withResolvedRestaurantAction(accessPromise, handler);
  } catch (error) {
    return actionError(error, messages.onError, messages.onForbidden);
  }
}

export function runRestaurantAction<R extends { ok: boolean }>(
  flags: Flag[],
  messages: ActionMessages,
  handler: (context: RestaurantActionContext) => Promise<R>,
): Promise<R | ActionFailure> {
  return runAction(requireFlags(flags), messages, handler);
}

export function runRestaurantAnyFlagAction<R extends { ok: boolean }>(
  flags: Flag[],
  messages: ActionMessages,
  handler: (context: RestaurantActionContext) => Promise<R>,
): Promise<R | ActionFailure> {
  return runAction(requireAnyFlag(flags), messages, handler);
}
