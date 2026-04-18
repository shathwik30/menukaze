'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';

export async function signOutAction(): Promise<void> {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}
