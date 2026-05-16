import { getMongoConnection, getModels } from '@menukaze/db';
import { resolveFlags, type StaffRole } from '@menukaze/rbac';
import { requirePageFlag } from '@/lib/session';
import { StaffClient, type StaffMember, type StaffInviteRow } from './staff-client';

export const dynamic = 'force-dynamic';

const ROLE_OPTIONS: StaffRole[] = ['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom'];

export default async function StaffPage() {
  const { session, restaurantId, role, permissions } = await requirePageFlag(['staff.view']);
  const canInvite = permissions.includes('staff.invite');
  const canEdit = permissions.includes('staff.edit');
  const canRemove = permissions.includes('staff.remove');
  const canManageCustomRoles = permissions.includes('staff.manage_custom_roles');
  const roleOptions = ROLE_OPTIONS.filter((candidate) => {
    if (candidate === 'owner') return role === 'owner';
    if (candidate === 'custom') return canManageCustomRoles;
    if (role === 'owner') return true;
    return Array.from(resolveFlags({ role: candidate })).every((flag) =>
      permissions.includes(flag),
    );
  });

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
    const isCurrentUser = String(m.userId) === session.user.id;
    return {
      membershipId: String(m._id),
      userId: String(m.userId),
      email: user?.email ?? (isCurrentUser ? session.user.email : 'unknown'),
      name: user?.name ?? (isCurrentUser ? session.user.name : '—'),
      role: m.role,
      customPermissions: m.customPermissions ?? [],
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
    customPermissions: i.customPermissions ?? [],
    expiresAt: i.expiresAt.toISOString(),
  }));

  return (
    <div>
      <div
        style={{
          padding: '28px 40px 24px',
          borderBottom: '1px solid var(--mk-ink-100)',
          background: 'white',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--mk-saffron-700)',
            marginBottom: 8,
          }}
        >
          Team &amp; Admin
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: '-0.025em',
            color: 'var(--mk-ink-950)',
          }}
        >
          Staff
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mk-ink-500)', maxWidth: 560 }}>
          Invite team members and control their access with role-based permissions.
        </p>
      </div>
      <div style={{ padding: '24px 40px 48px' }}>
        <StaffClient
          currentUserId={session.user.id}
          currentUserRole={role}
          members={members}
          invites={inviteRows}
          canInvite={canInvite}
          canEdit={canEdit}
          canRemove={canRemove}
          roleOptions={roleOptions}
        />
      </div>
    </div>
  );
}
