import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { getSession } from '@/lib/session';
import { AcceptInviteForm } from './accept-form';

export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) redirect('/');
  const session = await getSession();

  const conn = await getMongoConnection('live');
  const { StaffInvite, Restaurant, User } = getModels(conn);

  const invite = await StaffInvite.findOne({ token }, null, { skipTenantGuard: true }).exec();

  if (!invite) {
    return (
      <InviteShell>
        <h1 className="text-2xl font-bold">Invite not found</h1>
        <p className="text-muted-foreground text-sm">
          This invite link is invalid. Ask the person who sent it to send a new one.
        </p>
        <Link
          href="/admin"
          className="border-input mt-4 inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >
          Go to your dashboard
        </Link>
      </InviteShell>
    );
  }

  if (invite.usedAt || invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    return (
      <InviteShell>
        <h1 className="text-2xl font-bold">Invite is no longer valid</h1>
        <p className="text-muted-foreground text-sm">
          {invite.usedAt
            ? 'This invite has already been accepted.'
            : invite.revokedAt
              ? 'This invite was revoked.'
              : 'This invite has expired.'}
        </p>
      </InviteShell>
    );
  }

  const restaurant = await Restaurant.findById(invite.restaurantId).lean().exec();

  if (!session) {
    const encodedToken = encodeURIComponent(token);
    // If a user already exists for the invite email, only "Log in" should be
    // offered — the invitee has already picked a password elsewhere on the
    // platform, so showing "Create account" would only confuse them (and
    // double-signup would fail on the unique email index anyway).
    const existingUser = await User.findOne({ emailLower: invite.email.toLowerCase() })
      .lean()
      .exec();

    return (
      <InviteShell>
        <h1 className="text-2xl font-bold">Join {restaurant?.name}</h1>
        <p className="text-muted-foreground text-sm">
          This invite was sent to <strong>{invite.email}</strong> for the{' '}
          <strong>{invite.role}</strong> role.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {existingUser ? (
            <Link
              href={`/login?invite=${encodedToken}`}
              className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-medium"
            >
              Log in to accept
            </Link>
          ) : (
            <Link
              href={`/signup?invite=${encodedToken}`}
              className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-medium"
            >
              Create account
            </Link>
          )}
        </div>
      </InviteShell>
    );
  }

  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return (
      <InviteShell>
        <h1 className="text-2xl font-bold">Wrong account</h1>
        <p className="text-muted-foreground text-sm">
          This invite was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{' '}
          <strong>{session.user.email}</strong>. Sign out and sign in with the invite email to
          accept.
        </p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <h1 className="text-2xl font-bold">Join {restaurant?.name}</h1>
      <p className="text-muted-foreground text-sm">
        You&apos;ve been invited to join <strong>{restaurant?.name}</strong> as{' '}
        <strong>{invite.role}</strong>.
      </p>
      <AcceptInviteForm token={token} />
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 p-8">
      {children}
    </main>
  );
}
