import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { getAuth } from './auth';

export interface SuperAdminUser {
  id: string;
  email: string;
  name: string;
}

export interface SuperAdminSession {
  user: SuperAdminUser;
  scopes: string[];
}

/**
 * Read the BetterAuth session, then verify the user is in the `super_admins`
 * collection. Returns null if not signed in or not a super admin.
 */
export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const userId = parseObjectId(session.user.id);
  if (!userId) return null;

  const conn = await getMongoConnection('live');
  const { SuperAdmin } = getModels(conn);
  const record = await SuperAdmin.findOne({ userId }).exec();
  if (!record) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? '',
    },
    scopes: record.scopes,
  };
}

/**
 * Require a super-admin session. Redirects to /login if the user is not
 * authenticated or not in the super_admins collection.
 */
export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await getSuperAdminSession();
  if (!session) redirect('/login');
  return session;
}
