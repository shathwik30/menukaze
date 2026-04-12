import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardRoot() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.restaurantId) redirect('/onboarding');
  redirect('/admin');
}
