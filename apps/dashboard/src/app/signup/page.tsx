import { redirect } from 'next/navigation';
import { getMongoConnection, getModels } from '@menukaze/db';
import { SignupForm } from './signup-form';

interface SignupPageProps {
  searchParams: Promise<{ invite?: string | string[] }>;
}

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const invite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
  const inviteToken = invite?.trim() ?? '';

  if (!inviteToken) {
    return <SignupForm inviteToken="" lockedEmail="" restaurantName="" />;
  }

  const conn = await getMongoConnection('live');
  const { StaffInvite, Restaurant, User } = getModels(conn);
  const found = await StaffInvite.findOne({ token: inviteToken }, null, {
    skipTenantGuard: true,
  }).exec();

  if (!found || found.usedAt || found.revokedAt || found.expiresAt.getTime() < Date.now()) {
    // Fall through to the normal signup page — the /invite link will explain
    // the status if they visit it directly.
    return <SignupForm inviteToken="" lockedEmail="" restaurantName="" />;
  }

  // If an account already exists for this email, bounce straight to login —
  // "create account" should never re-appear once an account exists.
  const existing = await User.findOne({ emailLower: found.email.toLowerCase() }).lean().exec();
  if (existing) {
    redirect(`/login?invite=${encodeURIComponent(inviteToken)}`);
  }

  const restaurant = await Restaurant.findById(found.restaurantId).lean().exec();

  return (
    <SignupForm
      inviteToken={inviteToken}
      lockedEmail={found.email}
      restaurantName={restaurant?.name ?? ''}
    />
  );
}
