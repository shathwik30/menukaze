import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { getMongoConnection, getModels } from '@menukaze/db';
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
  return session as CurrentSession & { restaurantId: string };
}
