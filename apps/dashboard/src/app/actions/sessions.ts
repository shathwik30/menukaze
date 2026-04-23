'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import mongoose from 'mongoose';
import { z } from 'zod';
import { getMongoConnection } from '@menukaze/db';
import { actionError, validationError, type ActionResult } from '@/lib/action-helpers';
import { requireSession } from '@/lib/session';

// BetterAuth stores sessions in `session`. We read/write directly so operators
// can see every device they've signed in from and revoke anything they don't
// recognise, without pulling a separate plugin.

interface AuthSessionRow {
  _id: unknown;
  id?: string;
  userId: string;
  token?: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Custom label set by the user; stored as an extra field on the session doc. */
  deviceLabel?: string | null;
}

export interface SessionSummary {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  createdAt: string | null;
  expiresAt: string;
  lastActiveAt: string | null;
}

async function sessionCollection() {
  const conn = await getMongoConnection('live');
  const db = conn.db;
  if (!db) throw new Error('Database handle unavailable.');
  return db.collection<AuthSessionRow>('session');
}

function readSessionToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  // BetterAuth uses the cookiePrefix "menukaze" (see packages/auth/src/config.ts).
  // The cookie value is `token.signedValue`; we only need the token portion.
  const parts = cookieHeader.split(';').map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith('menukaze.session_token=')) {
      const raw = decodeURIComponent(part.slice('menukaze.session_token='.length));
      return raw.split('.')[0] ?? null;
    }
  }
  return null;
}

export async function listMySessionsAction(): Promise<
  ActionResult<{ sessions: SessionSummary[] }>
> {
  try {
    const session = await requireSession();
    const h = await headers();
    const currentToken = readSessionToken(h.get('cookie'));

    const col = await sessionCollection();
    const rows = await col.find({ userId: session.user.id }).toArray();

    const summaries: SessionSummary[] = rows.map((row) => ({
      id: String(row._id ?? row.id ?? row.token ?? ''),
      current: currentToken !== null && row.token === currentToken,
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      deviceLabel: row.deviceLabel ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      expiresAt: new Date(row.expiresAt).toISOString(),
      lastActiveAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

    summaries.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      const at = a.lastActiveAt ?? a.createdAt ?? a.expiresAt;
      const bt = b.lastActiveAt ?? b.createdAt ?? b.expiresAt;
      return new Date(bt).getTime() - new Date(at).getTime();
    });

    return { ok: true, data: { sessions: summaries } };
  } catch (error) {
    return actionError(error, 'Failed to list sessions.');
  }
}

const revokeInput = z.object({ sessionId: z.string().min(1) });

export async function revokeSessionAction(raw: unknown): Promise<ActionResult> {
  const parsed = revokeInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const session = await requireSession();
    const col = await sessionCollection();
    const filter = buildSessionFilter(parsed.data.sessionId, session.user.id);
    // Cast: BetterAuth stores `_id` as ObjectId; Mongo collection typed as
    // AuthSessionRow doesn't match exactly. Safe because we filter by userId.
    await col.deleteOne(filter as never);
    revalidatePath('/admin/settings/sessions');
    return { ok: true };
  } catch (error) {
    return actionError(error, 'Failed to revoke session.');
  }
}

function buildSessionFilter(sessionId: string, userId: string): Record<string, unknown> {
  const { ObjectId } = mongoose.Types;
  if (ObjectId.isValid(sessionId)) {
    return { _id: new ObjectId(sessionId), userId };
  }
  return { id: sessionId, userId };
}

export async function revokeAllOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireSession();
    const h = await headers();
    const currentToken = readSessionToken(h.get('cookie'));

    const col = await sessionCollection();
    const filter: Record<string, unknown> = { userId: session.user.id };
    if (currentToken) filter.token = { $ne: currentToken };
    const result = await col.deleteMany(filter);
    revalidatePath('/admin/settings/sessions');
    return { ok: true, data: { count: result.deletedCount ?? 0 } };
  } catch (error) {
    return actionError(error, 'Failed to revoke sessions.');
  }
}

const labelInput = z.object({
  sessionId: z.string().min(1),
  label: z.string().max(80),
});

export async function setDeviceLabelAction(raw: unknown): Promise<ActionResult> {
  const parsed = labelInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const session = await requireSession();
    const col = await sessionCollection();
    const filter = buildSessionFilter(parsed.data.sessionId, session.user.id);
    const trimmed = parsed.data.label.trim();
    await col.updateOne(
      filter as never,
      trimmed ? { $set: { deviceLabel: trimmed } } : { $unset: { deviceLabel: '' } },
    );
    revalidatePath('/admin/settings/sessions');
    return { ok: true };
  } catch (error) {
    return actionError(error, 'Failed to save device label.');
  }
}
