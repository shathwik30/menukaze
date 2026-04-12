import 'server-only';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { hasAllFlags, hasAnyFlag, resolveFlags, type Flag, type StaffRole } from '@menukaze/rbac';
import { getAuth } from './auth';

const ACTIVE_RESTAURANT_COOKIE = 'menukaze_active_restaurant_id';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface CurrentSession {
  user: SessionUser;
  /** Null if the user has signed up but not completed onboarding yet. */
  restaurantId: string | null;
  role: StaffRole | null;
  permissions: Flag[];
}

export interface RestaurantSessionContext {
  session: CurrentSession & { restaurantId: string };
  restaurantId: Types.ObjectId;
}

export interface AuthorizedSession extends RestaurantSessionContext {
  role: StaffRole;
  permissions: readonly Flag[];
}

function requireObjectId(value: string, entity: string): Types.ObjectId {
  const objectId = parseObjectId(value);
  if (!objectId) {
    throw new Error(`Unknown ${entity}.`);
  }
  return objectId;
}

/**
 * Read the BetterAuth session from the request cookies (server component
 * compatible). Returns `null` if not signed in.
 */
export async function getSession(): Promise<CurrentSession | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const userId = requireObjectId(session.user.id, 'user');
  const conn = await getMongoConnection('live');
  const { StaffMembership } = getModels(conn);
  const preferredRestaurantId = (await cookies()).get(ACTIVE_RESTAURANT_COOKIE)?.value;
  const preferredRestaurantObjectId = preferredRestaurantId
    ? parseObjectId(preferredRestaurantId)
    : null;

  const preferredMembership = preferredRestaurantObjectId
    ? await StaffMembership.findOne(
        {
          userId,
          restaurantId: preferredRestaurantObjectId,
          status: 'active',
        },
        { restaurantId: 1, role: 1, customPermissions: 1 },
        { skipTenantGuard: true },
      ).exec()
    : null;

  const membership =
    preferredMembership ??
    (await StaffMembership.findOne(
      { userId, status: 'active' },
      { restaurantId: 1, role: 1, customPermissions: 1 },
      { skipTenantGuard: true },
    )
      .sort({ updatedAt: -1 })
      .exec());

  const permissions = membership
    ? Array.from(
        resolveFlags({
          role: membership.role,
          customPermissions: membership.customPermissions,
        }),
      )
    : [];

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? '',
    },
    restaurantId: membership ? String(membership.restaurantId) : null,
    role: membership?.role ?? null,
    permissions,
  };
}

/**
 * Server-component / server-action helper. Redirects to /login if no session.
 * Returns the session, guaranteed non-null.
 */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/**
 * Like `requireSession`, but also requires the user to have completed onboarding.
 * Redirects to /onboarding otherwise. Returns the session with non-null
 * `restaurantId`.
 */
export async function requireOnboarded(): Promise<CurrentSession & { restaurantId: string }> {
  const session = await requireSession();
  if (!session.restaurantId) redirect('/onboarding');
  return { ...session, restaurantId: session.restaurantId };
}

export async function requireOnboardedRestaurant(): Promise<RestaurantSessionContext> {
  const session = await requireOnboarded();
  return {
    session,
    restaurantId: requireObjectId(session.restaurantId, 'restaurant'),
  };
}

/**
 * Thrown by `requireFlags` / `requireAnyFlag` when the caller's StaffMembership
 * does not have the permission needed for the action.
 */
export class PermissionDeniedError extends Error {
  public constructor(flags: Flag[]) {
    super(`Permission denied: requires one of [${flags.join(', ')}]`);
    this.name = 'PermissionDeniedError';
  }
}

async function loadActiveMembership(session: CurrentSession & { restaurantId: string }) {
  const restaurantId = requireObjectId(session.restaurantId, 'restaurant');
  const userId = requireObjectId(session.user.id, 'user');
  const conn = await getMongoConnection('live');
  const { StaffMembership } = getModels(conn);
  const membership = await StaffMembership.findOne({
    restaurantId,
    userId,
    status: 'active',
  }).exec();
  if (!membership) throw new PermissionDeniedError([]);
  return membership;
}

function permissionsForMembership(membership: Awaited<ReturnType<typeof loadActiveMembership>>) {
  return Array.from(
    resolveFlags({
      role: membership.role,
      customPermissions: membership.customPermissions,
    }),
  );
}

/**
 * Require the caller to hold every flag in the list.
 */
export async function requireFlags(flags: Flag[]): Promise<AuthorizedSession> {
  const context = await requireOnboardedRestaurant();
  const membership = await loadActiveMembership(context.session);
  if (
    !hasAllFlags({ role: membership.role, customPermissions: membership.customPermissions }, flags)
  ) {
    throw new PermissionDeniedError(flags);
  }
  return {
    ...context,
    role: membership.role,
    permissions: permissionsForMembership(membership),
  };
}

/**
 * Require the caller to hold at least one flag in the list.
 */
export async function requireAnyFlag(flags: Flag[]): Promise<AuthorizedSession> {
  const context = await requireOnboardedRestaurant();
  const membership = await loadActiveMembership(context.session);
  if (
    !hasAnyFlag({ role: membership.role, customPermissions: membership.customPermissions }, flags)
  ) {
    throw new PermissionDeniedError(flags);
  }
  return {
    ...context,
    role: membership.role,
    permissions: permissionsForMembership(membership),
  };
}

export async function requireAnyPageFlag(flags: Flag[]): Promise<AuthorizedSession> {
  try {
    return await requireAnyFlag(flags);
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }
}

export async function requirePageFlag(flags: Flag[]): Promise<AuthorizedSession> {
  try {
    return await requireFlags(flags);
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }
}
