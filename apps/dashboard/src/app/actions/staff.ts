'use server';

import { revalidatePath } from 'next/cache';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels, generateInviteToken } from '@menukaze/db';
import { parseObjectId } from '@menukaze/db/object-id';
import { captureException } from '@menukaze/monitoring';
import { assertCustomRoleFlags, resolveFlags, type Flag, type StaffRole } from '@menukaze/rbac';
import { sendTransactionalEmail } from '@menukaze/shared/transactional-email';
import {
  actionError,
  invalidEntityError,
  validationError,
  type ActionResult,
} from '@/lib/action-helpers';
import { PermissionDeniedError, requireFlags, requireSession } from '@/lib/session';
import { recordAudit } from '@/lib/audit';
import { StaffInviteEmail } from '@/emails/staff-invite';

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
  staffMembershipModel: ReturnType<typeof getModels>['StaffMembership'],
  restaurantId: Types.ObjectId,
): Promise<number> {
  return staffMembershipModel
    .countDocuments({ restaurantId, role: 'owner', status: 'active' })
    .exec();
}

const inviteInput = z.object({
  email: z.string().email().max(320),
  role: z.enum(['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom']),
  customPermissions: z.array(z.string()).max(128).default([]),
});

export async function inviteStaffAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const {
      session,
      restaurantId,
      role: actorRole,
      permissions,
    } = await requireStaffFlag('staff.invite');
    if (parsed.data.role === 'custom' && !permissions.includes('staff.manage_custom_roles')) {
      return { ok: false, error: 'You do not have permission to manage custom roles.' };
    }

    const roleInput = normalizeRoleInput(parsed.data.role, parsed.data.customPermissions);
    if ('error' in roleInput) return { ok: false, error: roleInput.error };
    const roleCheck = assertCanAssignRole(actorRole, permissions, roleInput);
    if (!roleCheck.ok) return roleCheck;

    const invitedByUserId = parseObjectId(session.user.id);
    if (!invitedByUserId) {
      return { ok: false, error: 'Unknown session.' };
    }
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
      captureException(error, { surface: 'dashboard:staff', message: 'invite email failed' });
    }

    await recordAudit({
      restaurantId,
      userId: session.user.id,
      userEmail: session.user.email,
      role: actorRole,
      action: 'staff.invited',
      resourceType: 'invite',
      resourceId: String(invite._id),
      metadata: { email: inviteEmail, role: roleInput.role },
    });
    revalidatePath('/admin/staff');
    return { ok: true, data: { id: String(invite._id) } };
  } catch (error) {
    return actionError(error, 'Failed to invite.', 'You do not have permission to manage staff.');
  }
}

export async function revokeInviteAction(id: string): Promise<ActionResult> {
  const inviteId = parseObjectId(id);
  if (!inviteId) return invalidEntityError('invite');

  try {
    const { restaurantId } = await requireStaffFlag('staff.invite');
    const conn = await getMongoConnection('live');
    const { StaffInvite } = getModels(conn);
    await StaffInvite.updateOne(
      { restaurantId, _id: inviteId, usedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return actionError(error, 'Failed to revoke.', 'You do not have permission to manage staff.');
  }
}

const changeRoleInput = z.object({
  membershipId: z.string().min(1),
  role: z.enum(['owner', 'manager', 'waiter', 'kitchen', 'cashier', 'custom']),
  customPermissions: z.array(z.string()).max(128).default([]),
});

export async function changeRoleAction(raw: unknown): Promise<ActionResult> {
  const parsed = changeRoleInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  const membershipId = parseObjectId(parsed.data.membershipId);
  if (!membershipId) return invalidEntityError('membership');

  try {
    const {
      session,
      restaurantId,
      role: actorRole,
      permissions,
    } = await requireStaffFlag('staff.edit');
    if (parsed.data.role === 'custom' && !permissions.includes('staff.manage_custom_roles')) {
      return { ok: false, error: 'You do not have permission to manage custom roles.' };
    }

    const roleInput = normalizeRoleInput(parsed.data.role, parsed.data.customPermissions);
    if ('error' in roleInput) return { ok: false, error: roleInput.error };
    const roleCheck = assertCanAssignRole(actorRole, permissions, roleInput);
    if (!roleCheck.ok) return roleCheck;

    const conn = await getMongoConnection('live');
    const { StaffMembership } = getModels(conn);
    const target = await StaffMembership.findOne({
      restaurantId,
      _id: membershipId,
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
    await recordAudit({
      restaurantId,
      userId: session.user.id,
      userEmail: session.user.email,
      role: actorRole,
      action: 'staff.role_changed',
      resourceType: 'membership',
      resourceId: String(target._id),
      metadata: { from: target.role, to: roleInput.role },
    });
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return actionError(
      error,
      'Failed to change role.',
      'You do not have permission to manage staff.',
    );
  }
}

export async function removeStaffAction(membershipId: string): Promise<ActionResult> {
  const membershipObjectId = parseObjectId(membershipId);
  if (!membershipObjectId) return invalidEntityError('membership');

  try {
    const { session, restaurantId, role: actorRole } = await requireStaffFlag('staff.remove');
    const conn = await getMongoConnection('live');
    const { StaffMembership } = getModels(conn);

    const target = await StaffMembership.findOne({
      restaurantId,
      _id: membershipObjectId,
    }).exec();
    if (!target) return { ok: false, error: 'Membership not found.' };
    if (String(target.userId) === session.user.id) {
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
    await recordAudit({
      restaurantId,
      userId: session.user.id,
      userEmail: session.user.email,
      role: actorRole,
      action: 'staff.removed',
      resourceType: 'membership',
      resourceId: String(target._id),
      metadata: { previousRole: target.role },
    });
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return actionError(
      error,
      'Failed to remove staff member.',
      'You do not have permission to manage staff.',
    );
  }
}

/**
 * Signed-in user accepts an invite token. Creates an active StaffMembership
 * bound to their user id with the role the invite specified.
 */
export async function acceptInviteAction(
  token: string,
): Promise<ActionResult<{ restaurantId: string }>> {
  const current = await requireSession();
  if (!token || token.length < 16) return { ok: false, error: 'Invalid invite token.' };

  const userId = parseObjectId(current.user.id);
  if (!userId) return { ok: false, error: 'Unknown user.' };

  const conn = await getMongoConnection('live');
  const { StaffInvite, StaffMembership, User } = getModels(conn);
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
