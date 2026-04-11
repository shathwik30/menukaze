'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';

/**
 * Server action: end the current session and bounce to the login page.
 *
 * BetterAuth's `auth.api.signOut` revokes the session record server-side and,
 * via the nextCookies plugin we registered in `lib/auth.ts`, clears the
 * Set-Cookie header on the response automatically.
 */
export async function signOutAction(): Promise<void> {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}
