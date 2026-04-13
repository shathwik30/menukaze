import { redirect } from 'next/navigation';
import { getSuperAdminSession } from '@/lib/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSuperAdminSession();
  if (session) redirect('/health');
  return <LoginForm />;
}
