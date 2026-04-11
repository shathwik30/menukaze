import { Types } from 'mongoose';
import Link from 'next/link';
import { getMongoConnection, getModels } from '@menukaze/db';
import { requireOnboarded } from '@/lib/session';
import { StaffClient, type StaffMember, type StaffInviteRow } from './staff-client';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const session = await requireOnboarded();
  const restaurantId = new Types.ObjectId(session.restaurantId);

  const conn = await getMongoConnection('live');
  const { StaffMembership, User, StaffInvite } = getModels(conn);

  const memberships = await StaffMembership.find({ restaurantId }).lean().exec();
  const userIds = memberships.map((m) => m.userId);
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: userIds } }, null, { skipTenantGuard: true })
          .lean()
          .exec()
      : [];
  const usersById = new Map(users.map((u) => [String(u._id), u]));

  const members: StaffMember[] = memberships.map((m) => {
    const user = usersById.get(String(m.userId));
    // Normalize the 'custom' role into a predefined slot for display — the
    // dashboard UI only supports predefined roles in Step 18. Custom-role
    // support ships post-MVP.
    const role = m.role === 'custom' ? 'waiter' : m.role;
    return {
      membershipId: String(m._id),
      userId: String(m.userId),
      email: user?.email ?? 'unknown',
      name: user?.name ?? '—',
      role,
      status: m.status,
    };
  });

  const invites = await StaffInvite.find({
    restaurantId,
    usedAt: { $exists: false },
    revokedAt: { $exists: false },
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const inviteRows: StaffInviteRow[] = invites.map((i) => ({
    id: String(i._id),
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-muted-foreground text-sm">Invite and manage team members</p>
        </div>
        <Link href="/admin" className="text-foreground text-sm underline underline-offset-4">
          ← Back
        </Link>
      </header>

      <StaffClient currentUserId={session.user.id} members={members} invites={inviteRows} />
    </main>
  );
}
