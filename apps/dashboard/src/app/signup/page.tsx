import { SignupForm } from './signup-form';

interface SignupPageProps {
  searchParams: Promise<{ invite?: string | string[] }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const invite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  return <SignupForm inviteToken={invite?.trim() ?? ''} />;
}
