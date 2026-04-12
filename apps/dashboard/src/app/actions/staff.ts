'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels, generateInviteToken } from '@menukaze/db';
import { assertCustomRoleFlags, resolveFlags, type Flag, type StaffRole } from '@menukaze/rbac';
import { PermissionDeniedError, requireFlags, requireSession } from '@/lib/session';
import { sendTransactionalEmail } from '@/lib/email';
import { StaffInviteEmail } from '@/emails/staff-invite';

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function zodError(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input.';
}

interface NormalizedRoleInput {
  role: StaffRole;
  customPermissions?: Flag[];
}

function normalizeRoleInput(
  role: StaffRole,
  customPermissions: string[],
): NormalizedRoleInput | { error: string } {
  if (role !== 'custom') return { role };

  const deduped = [...new Set(customPermissions)];
  if (deduped.length === 0) {
    return { error: 'Pick at least one permission for a custom role.' };
  }

  try {
    assertCustomRoleFlags(deduped);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Custom role contains invalid permission flags.',
    };
  }

  return { role, customPermissions: deduped as Flag[] };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function requireStaffFlag(flag: Flag) {
  try {
    return await requireFlags([flag]);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new Error('You do not have permission to manage staff.');
    }
    throw error;
  }
}

function canManageOwnerRole(actorRole: StaffRole): boolean {
  return actorRole === 'owner';
}

function assertCanAssignRole(
  actorRole: StaffRole,
  actorPermissions: readonly Flag[],
  target: NormalizedRoleInput,
): { ok: true } | { ok: false; error: string } {
  if (target.role === 'owner' && !canManageOwnerRole(actorRole)) {
    return { ok: false, error: 'Only an owner can grant the owner role.' };
  }
  if (actorRole !== 'owner') {
    const actorFlagSet = new Set(actorPermissions);
    const targetFlags =
      target.role === 'custom'
        ? (target.customPermissions ?? [])
        : Array.from(resolveFlags({ role: target.role }));
    const hasEveryTargetFlag = targetFlags.every((flag) => actorFlagSet.has(flag));
    if (!hasEveryTargetFlag) {
      return { ok: false, error: 'You cannot assign a role with permissions you do not have.' };
    }
  }
  return { ok: true };
}

async function countActiveOwners(
  StaffMembership: ReturnType<typeof getModels>['StaffMembership'],
  restaurantId: Types.ObjectId,
): Promise<number> {
  return StaffMembership.countDocuments({ restaurantId, role: 'owner', status: 'active' }).exec();
}

const inviteInput = z.object({
  email: z.string().email().max(320),
  role: z.enum(['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom']),
  customPermissions: z.array(z.string()).max(128).default([]),
});

export async function inviteStaffAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  try {
    const { session, role: actorRole, permissions } = await requireStaffFlag('staff.invite');
    if (parsed.data.role === 'custom' && !permissions.includes('staff.manage_custom_roles')) {
      return { ok: false, error: 'You do not have permission to manage custom roles.' };
    }

    const roleInput = normalizeRoleInput(parsed.data.role, parsed.data.customPermissions);
    if ('error' in roleInput) return { ok: false, error: roleInput.error };
    const roleCheck = assertCanAssignRole(actorRole, permissions, roleInput);
    if (!roleCheck.ok) return roleCheck;

    const restaurantId = new Types.ObjectId(session.restaurantId);
    const invitedByUserId = new Types.ObjectId(session.user.id);
    const inviteEmail = parsed.data.email.toLowerCase();

    const conn = await getMongoConnection('live');
    const { Restaurant, StaffInvite, StaffMembership, User } = getModels(conn);

    const restaurant = await Restaurant.findById(restaurantId).exec();
    if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

    const existingUser = await User.findOne({
      $or: [
        { emailLower: inviteEmail },
        { email: { $regex: new RegExp(`^${escapeRegExp(inviteEmail)}$`, 'i') } },
      ],
    })
      .lean()
      .exec();
    if (existingUser) {
      const existingMembership = await StaffMembership.findOne({
        restaurantId,
        userId: existingUser._id,
        status: 'active',
      })
        .lean()
        .exec();
      if (existingMembership) {
        return { ok: false, error: 'This email is already on your team.' };
      }
    }

    const activeInvite = await StaffInvite.findOne({
      restaurantId,
      $or: [
        { email: inviteEmail },
        { email: { $regex: new RegExp(`^${escapeRegExp(inviteEmail)}$`, 'i') } },
      ],
      usedAt: { $exists: false },
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .lean()
      .exec();
    if (activeInvite) {
      return { ok: false, error: 'This email already has a pending invite.' };
    }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await StaffInvite.create({
      restaurantId,
      email: inviteEmail,
      role: roleInput.role,
      ...(roleInput.customPermissions ? { customPermissions: roleInput.customPermissions } : {}),
      token,
      invitedByUserId,
      expiresAt,
    });

    const baseUrl = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/invite/${encodeURIComponent(token)}`;

    try {
      await sendTransactionalEmail({
        to: parsed.data.email,
        subject: `You're invited to join ${restaurant.name}`,
        react: StaffInviteEmail({
          restaurantName: restaurant.name,
          inviterName: session.user.name ?? session.user.email,
          role: roleInput.role,
          acceptUrl,
        }),
      });
    } catch (error) {
      console.warn('[staff] invite email failed', error);
    }

    revalidatePath('/admin/staff');
    return { ok: true, data: { id: String(invite._id) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to invite.' };
  }
}

export async function revokeInviteAction(id: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: 'Unknown invite.' };
  try {
    const { session } = await requireStaffFlag('staff.invite');
    const restaurantId = new Types.ObjectId(session.restaurantId);
    const conn = await getMongoConnection('live');
    const { StaffInvite } = getModels(conn);
    await StaffInvite.updateOne(
      { restaurantId, _id: new Types.ObjectId(id), usedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to revoke.' };
  }
}

const changeRoleInput = z.object({
  membershipId: z.string().min(1),
  role: z.enum(['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom']),
  customPermissions: z.array(z.string()).max(128).default([]),
});

export async function changeRoleAction(raw: unknown): Promise<ActionResult> {
  const parsed = changeRoleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.membershipId)) {
    return { ok: false, error: 'Unknown membership.' };
  }
  try {
    const { session, role: actorRole, permissions } = await requireStaffFlag('staff.edit');
    if (parsed.data.role === 'custom' && !permissions.includes('staff.manage_custom_roles')) {
      return { ok: false, error: 'You do not have permission to manage custom roles.' };
    }

    const roleInput = normalizeRoleInput(parsed.data.role, parsed.data.customPermissions);
    if ('error' in roleInput) return { ok: false, error: roleInput.error };
    const roleCheck = assertCanAssignRole(actorRole, permissions, roleInput);
    if (!roleCheck.ok) return roleCheck;

    const restaurantId = new Types.ObjectId(session.restaurantId);
    const conn = await getMongoConnection('live');
    const { StaffMembership } = getModels(conn);
    const target = await StaffMembership.findOne({
      restaurantId,
      _id: new Types.ObjectId(parsed.data.membershipId),
    }).exec();
    if (!target) return { ok: false, error: 'Membership not found.' };
    if (target.role === 'custom' && !permissions.includes('staff.manage_custom_roles')) {
      return { ok: false, error: 'You do not have permission to manage custom roles.' };
    }
    if (String(target.userId) === session.user.id) {
      return { ok: false, error: 'You cannot change your own role.' };
    }
    if (target.role === 'owner' && actorRole !== 'owner') {
      return { ok: false, error: 'Only an owner can change another owner.' };
    }
    if (target.role === 'owner' && roleInput.role !== 'owner') {
      const ownerCount = await countActiveOwners(StaffMembership, restaurantId);
      if (ownerCount <= 1) {
        return { ok: false, error: 'A restaurant must always have at least one active owner.' };
      }
    }

    const update = roleInput.customPermissions
      ? {
          $set: {
            role: roleInput.role,
            customPermissions: roleInput.customPermissions,
          },
        }
      : {
          $set: { role: roleInput.role },
          $unset: { customPermissions: 1 },
        };
    await StaffMembership.updateOne({ restaurantId, _id: target._id }, update).exec();
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to change role.' };
  }
}

export async function removeStaffAction(membershipId: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(membershipId)) return { ok: false, error: 'Unknown membership.' };
  try {
    const { session, role: actorRole } = await requireStaffFlag('staff.remove');
    const restaurantId = new Types.ObjectId(session.restaurantId);
    const conn = await getMongoConnection('live');
    const { StaffMembership } = getModels(conn);

    // Don't let someone delete their own membership — they'd lock themselves out.
    const target = await StaffMembership.findOne({
      restaurantId,
      _id: new Types.ObjectId(membershipId),
    }).exec();
    if (!target) return { ok: false, error: 'Membership not found.' };
    if (String(target.userId) === String(session.user.id)) {
      return { ok: false, error: 'You cannot remove your own membership.' };
    }
    if (target.role === 'owner' && actorRole !== 'owner') {
      return { ok: false, error: 'Only an owner can remove another owner.' };
    }
    if (target.role === 'owner') {
      const ownerCount = await countActiveOwners(StaffMembership, restaurantId);
      if (ownerCount <= 1) {
        return { ok: false, error: 'A restaurant must always have at least one active owner.' };
      }
    }

    await StaffMembership.updateOne(
      { restaurantId, _id: target._id },
      { $set: { status: 'deactivated' } },
    ).exec();
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to remove.' };
  }
}

/**
 * Signed-in user accepts an invite token. Creates an active StaffMembership
 * bound to their user id with the role the invite specified. Called from
 * /invite/[token] via a client form.
 */
export async function acceptInviteAction(
  token: string,
): Promise<ActionResult<{ restaurantId: string }>> {
  // The invitee may not yet have their own restaurant, so we use
  // requireSession (not requireOnboarded) — joining another tenant's
  // staff does not require finishing your own onboarding wizard.
  const current = await requireSession();
  if (!token || token.length < 16) return { ok: false, error: 'Invalid invite token.' };

  const conn = await getMongoConnection('live');
  const { StaffInvite, StaffMembership, User } = getModels(conn);

  // Cross-tenant lookup — StaffInvite is tenant-scoped, so we use the escape hatch.
  const invite = await StaffInvite.findOne({ token }, null, { skipTenantGuard: true }).exec();
  if (!invite) return { ok: false, error: 'Invite not found.' };
  if (invite.usedAt) return { ok: false, error: 'This invite has already been accepted.' };
  if (invite.revokedAt) return { ok: false, error: 'This invite was revoked.' };
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'This invite has expired.' };
  }
  if (invite.email.toLowerCase() !== current.user.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that email to accept.`,
    };
  }

  const restaurantId = invite.restaurantId;
  const userId = new Types.ObjectId(current.user.id);
  const now = new Date();
  const dbSession = await conn.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const update = invite.customPermissions
        ? {
            $set: {
              role: invite.role,
              status: 'active',
              invitedBy: invite.invitedByUserId,
              customPermissions: invite.customPermissions,
            },
            $setOnInsert: { restaurantId, userId },
          }
        : {
            $set: {
              role: invite.role,
              status: 'active',
              invitedBy: invite.invitedByUserId,
            },
            $unset: { customPermissions: 1 },
            $setOnInsert: { restaurantId, userId },
          };
      await StaffMembership.updateOne({ restaurantId, userId }, update, {
        upsert: true,
        session: dbSession,
      }).exec();

      const consume = await StaffInvite.updateOne(
        {
          restaurantId,
          _id: invite._id,
          usedAt: { $exists: false },
          revokedAt: { $exists: false },
          expiresAt: { $gt: now },
        },
        { $set: { usedAt: now } },
        { session: dbSession },
      ).exec();
      if (consume.modifiedCount !== 1) throw new Error('This invite is no longer valid.');

      // Auto-verify the invited user's email — the invite email itself proves
      // ownership, so requiring a separate verification step is redundant.
      await User.updateOne(
        { _id: userId, emailVerified: false },
        { $set: { emailVerified: true } },
        { session: dbSession },
      ).exec();
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to accept invite.',
    };
  } finally {
    await dbSession.endSession();
  }

  return { ok: true, data: { restaurantId: String(restaurantId) } };
}
