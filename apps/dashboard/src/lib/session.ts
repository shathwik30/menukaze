import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
import { hasAllFlags, hasAnyFlag, type Flag } from '@menukaze/rbac';
import { getAuth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface CurrentSession {
  user: SessionUser;
  /** Null if the user has signed up but not completed onboarding yet. */
  restaurantId: string | null;
}

/**
 * Read the BetterAuth session from the request cookies (server component
 * compatible). Returns `null` if not signed in.
 */
export async function getSession(): Promise<CurrentSession | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  // Resolve the user's primary restaurant via staff_memberships. A user can
  // be a member of multiple restaurants; for Phase 4 we always pick the
  // first one. Phase 4.x will add a tenant switcher.
  const conn = await getMongoConnection('live');
  const { StaffMembership } = getModels(conn);
  const membership = await StaffMembership.findOne(
    { userId: new Types.ObjectId(session.user.id), status: 'active' },
    { restaurantId: 1 },
    { skipTenantGuard: true },
  ).exec();

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? '',
    },
    restaurantId: membership ? String(membership.restaurantId) : null,
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

/**
 * Thrown by `requireFlags` / `requireAnyFlag` when the caller's StaffMembership
 * doesn't have the permission needed for the action. Server actions catch
 * this and surface `{ ok: false, error }` to the client.
 */
export class PermissionDeniedError extends Error {
  public constructor(flags: Flag[]) {
    super(`Permission denied: requires one of [${flags.join(', ')}]`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Load the current user's StaffMembership for the active restaurant. Used
 * by the RBAC helpers below — not typically called by server actions
 * directly.
 */
async function loadActiveMembership(session: CurrentSession & { restaurantId: string }) {
  const conn = await getMongoConnection('live');
  const { StaffMembership } = getModels(conn);
  const membership = await StaffMembership.findOne({
    restaurantId: new Types.ObjectId(session.restaurantId),
    userId: new Types.ObjectId(session.user.id),
    status: 'active',
  }).exec();
  if (!membership) throw new PermissionDeniedError([]);
  return membership;
}

/**
 * Require the caller to hold **every** flag in the list. Throws
 * `PermissionDeniedError` if any is missing. The membership is returned
 * so the caller can also use the staff member's role / user id.
 */
export async function requireFlags(
  flags: Flag[],
): Promise<{ session: CurrentSession & { restaurantId: string }; role: string }> {
  const session = await requireOnboarded();
  const membership = await loadActiveMembership(session);
  if (
    !hasAllFlags({ role: membership.role, customPermissions: membership.customPermissions }, flags)
  ) {
    throw new PermissionDeniedError(flags);
  }
  return { session, role: membership.role };
}

/**
 * Require the caller to hold **at least one** of the flags in the list.
 * Useful when an action is legal for several roles that have overlapping
 * but non-identical permissions (e.g., waiters can update status for
 * assigned orders; kitchen can update status for KDS).
 */
export async function requireAnyFlag(
  flags: Flag[],
): Promise<{ session: CurrentSession & { restaurantId: string }; role: string }> {
  const session = await requireOnboarded();
  const membership = await loadActiveMembership(session);
  if (
    !hasAnyFlag({ role: membership.role, customPermissions: membership.customPermissions }, flags)
  ) {
    throw new PermissionDeniedError(flags);
  }
  return { session, role: membership.role };
}
