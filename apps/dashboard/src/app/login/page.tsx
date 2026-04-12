import { LoginForm } from './login-form';

interface LoginPageProps {
  searchParams: Promise<{ invite?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const invite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  return <LoginForm inviteToken={invite?.trim() ?? ''} />;
}
