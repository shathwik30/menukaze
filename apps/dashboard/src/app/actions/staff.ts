'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { z } from 'zod';
import { getMongoConnection, getModels, generateInviteToken, type StaffRole } from '@menukaze/db';
import { hasAnyFlag } from '@menukaze/rbac';
import { requireOnboarded, requireSession } from '@/lib/session';
import { sendTransactionalEmail } from '@/lib/email';
import { StaffInviteEmail } from '@/emails/staff-invite';

const ROLES: StaffRole[] = ['owner', 'manager', 'waiter', 'kitchen', 'cashier'];

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function zodError(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input.';
}

/**
 * Enforces the caller is allowed to manage staff (owner / manager in the
 * predefined matrix). Throws a plain object-shaped error that we surface as
 * { ok: false, error } to keep the action-level contract consistent.
 */
async function requireStaffManager() {
  const session = await requireOnboarded();
  const conn = await getMongoConnection('live');
  const { StaffMembership } = getModels(conn);
  const membership = await StaffMembership.findOne({
    restaurantId: new Types.ObjectId(session.restaurantId),
    userId: new Types.ObjectId(session.user.id),
  }).exec();
  if (!membership) throw new Error('No active membership.');
  const allowed = hasAnyFlag(
    { role: membership.role, customPermissions: membership.customPermissions },
    ['staff.invite', 'staff.edit', 'staff.remove'],
  );
  if (!allowed) throw new Error('You do not have permission to manage staff.');
  return { session, membership };
}

const inviteInput = z.object({
  email: z.string().email().max(320),
  role: z.enum(['owner', 'manager', 'waiter', 'kitchen', 'cashier']),
});

export async function inviteStaffAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = inviteInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  try {
    const { session } = await requireStaffManager();
    const restaurantId = new Types.ObjectId(session.restaurantId);
    const invitedByUserId = new Types.ObjectId(session.user.id);

    const conn = await getMongoConnection('live');
    const { Restaurant, StaffInvite } = getModels(conn);

    const restaurant = await Restaurant.findById(restaurantId).exec();
    if (!restaurant) return { ok: false, error: 'Restaurant not found.' };

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await StaffInvite.create({
      restaurantId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
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
          role: parsed.data.role,
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
    const { session } = await requireStaffManager();
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
  role: z.enum(['owner', 'manager', 'waiter', 'kitchen', 'cashier']),
});

export async function changeRoleAction(raw: unknown): Promise<ActionResult> {
  const parsed = changeRoleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  if (!Types.ObjectId.isValid(parsed.data.membershipId)) {
    return { ok: false, error: 'Unknown membership.' };
  }
  try {
    const { session } = await requireStaffManager();
    const restaurantId = new Types.ObjectId(session.restaurantId);
    const conn = await getMongoConnection('live');
    const { StaffMembership } = getModels(conn);
    await StaffMembership.updateOne(
      { restaurantId, _id: new Types.ObjectId(parsed.data.membershipId) },
      { $set: { role: parsed.data.role } },
    ).exec();
    revalidatePath('/admin/staff');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to change role.' };
  }
}

export async function removeStaffAction(membershipId: string): Promise<ActionResult> {
  if (!Types.ObjectId.isValid(membershipId)) return { ok: false, error: 'Unknown membership.' };
  try {
    const { session } = await requireStaffManager();
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
  const { StaffInvite, StaffMembership } = getModels(conn);

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

  const existing = await StaffMembership.findOne({ restaurantId, userId }).exec();
  if (existing) {
    await StaffMembership.updateOne(
      { restaurantId, _id: existing._id },
      { $set: { role: invite.role, status: 'active', invitedBy: invite.invitedByUserId } },
    ).exec();
  } else {
    await StaffMembership.create({
      restaurantId,
      userId,
      role: invite.role,
      status: 'active',
      invitedBy: invite.invitedByUserId,
    });
  }

  await StaffInvite.updateOne(
    { restaurantId, _id: invite._id },
    { $set: { usedAt: new Date() } },
  ).exec();

  return { ok: true, data: { restaurantId: String(restaurantId) } };
}

export { ROLES };
